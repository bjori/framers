/** Practices are scheduled in local wall time (Greenbrook / NorCal). */
export const PRACTICE_TIMEZONE = "America/Los_Angeles";

/**
 * UTC epoch ms for when a practice session ends (session_date + end_time in Pacific).
 * Scans the calendar day window in UTC to handle DST.
 */
export function pacificPracticeEndUtcMs(sessionDateYmd: string, endTimeHhMm: string): number {
  const [y, mo, d] = sessionDateYmd.split("-").map((x) => parseInt(x, 10));
  const timeParts = endTimeHhMm.trim().split(":");
  const h = parseInt(timeParts[0], 10);
  const mi = parseInt(timeParts[1] ?? "0", 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(h) || !Number.isFinite(mi)) {
    return Date.UTC(y || 2020, (mo || 1) - 1, d || 1, 12 + h, mi, 0, 0);
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });

  const lo = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - 12 * 3600 * 1000;
  const hi = Date.UTC(y, mo - 1, d, 23, 59, 59, 999) + 12 * 3600 * 1000;

  for (let t = lo; t <= hi; t += 60 * 1000) {
    const parts = fmt.formatToParts(new Date(t));
    const get = (type: string) => {
      const p = parts.find((x) => x.type === type);
      return p ? parseInt(p.value, 10) : NaN;
    };
    const py = get("year");
    const pm = get("month");
    const pd = get("day");
    const ph = get("hour");
    const pmi = get("minute");
    // t = start of this wall-clock minute in Pacific; stay visible through that full minute
    if (py === y && pm === mo && pd === d && ph === h && pmi === mi) return t + 60 * 1000;
  }

  return Date.UTC(y, mo - 1, d, h + 8, mi, 0, 0) + 60 * 1000;
}

export function isPracticeSessionStillOnSchedule(
  sessionDateYmd: string,
  endTimeHhMm: string,
  nowMs: number = Date.now(),
): boolean {
  return nowMs < pacificPracticeEndUtcMs(sessionDateYmd, endTimeHhMm);
}

/** Keep sessions until Pacific end time has passed; sort soonest first. */
export function filterPracticeSessionsStillOnSchedule<
  T extends { session_date: string; end_time: string; start_time?: string },
>(sessions: T[], nowMs: number = Date.now()): T[] {
  const vis = sessions.filter((s) => isPracticeSessionStillOnSchedule(s.session_date, s.end_time, nowMs));
  vis.sort((a, b) => {
    const ka = `${a.session_date}\t${a.start_time ?? ""}`;
    const kb = `${b.session_date}\t${b.start_time ?? ""}`;
    return ka.localeCompare(kb);
  });
  return vis;
}

/** Ended sessions, most recent first. */
export function recentEndedPracticeSessions<
  T extends { session_date: string; end_time: string; start_time?: string },
>(sessions: T[], limit: number, nowMs: number = Date.now()): T[] {
  const ended = sessions.filter((s) => !isPracticeSessionStillOnSchedule(s.session_date, s.end_time, nowMs));
  ended.sort((a, b) => {
    const ka = `${a.session_date}\t${a.start_time ?? ""}`;
    const kb = `${b.session_date}\t${b.start_time ?? ""}`;
    return kb.localeCompare(ka);
  });
  return ended.slice(0, limit);
}
