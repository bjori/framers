/**
 * Per-line scheduling for league matches.
 *
 * A single USTA scorecard still maps to one `league_matches` row, but individual
 * lines (D1/D2/D3/S1/S2) can be scheduled on their own date/time via the
 * `match_line_schedules` override table. When no override exists, a line
 * inherits `league_matches.match_date` + `match_time`.
 *
 * Line IDs use the "root" position (D1, D2, D3, S1, S2). Lineup slot positions
 * like D1A / D1B both map to line D1.
 */

export type LineId = string;

export interface LineScheduleOverride {
  line: LineId;
  scheduled_date: string | null;
  scheduled_time: string | null;
}

export interface MatchScheduleDefaults {
  match_date: string;
  match_time: string | null;
}

export interface ResolvedSlot {
  date: string;
  time: string | null;
}

export interface ScheduleBlock extends ResolvedSlot {
  lines: LineId[];
}

export interface MatchFormat {
  singles: number;
  doubles: number;
}

export function positionToLine(position: string): LineId {
  return position.replace(/[ab]$/i, "").toUpperCase();
}

export function allLinesForFormat(format: MatchFormat): LineId[] {
  const lines: LineId[] = [];
  for (let i = 1; i <= format.singles; i++) lines.push(`S${i}`);
  for (let i = 1; i <= format.doubles; i++) lines.push(`D${i}`);
  return lines;
}

export async function loadLineSchedules(
  db: D1Database,
  matchId: string,
): Promise<LineScheduleOverride[]> {
  try {
    const { results } = await db
      .prepare(
        "SELECT line, scheduled_date, scheduled_time FROM match_line_schedules WHERE match_id = ?",
      )
      .bind(matchId)
      .all<LineScheduleOverride>();
    return results.map((r) => ({
      line: r.line.toUpperCase(),
      scheduled_date: r.scheduled_date,
      scheduled_time: r.scheduled_time,
    }));
  } catch {
    // Table may not exist yet (pre-migration); treat as empty overrides.
    return [];
  }
}

export async function loadLineSchedulesBatch(
  db: D1Database,
  matchIds: string[],
): Promise<Map<string, LineScheduleOverride[]>> {
  const out = new Map<string, LineScheduleOverride[]>();
  if (matchIds.length === 0) return out;
  try {
    const placeholders = matchIds.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT match_id, line, scheduled_date, scheduled_time
         FROM match_line_schedules
         WHERE match_id IN (${placeholders})`,
      )
      .bind(...matchIds)
      .all<LineScheduleOverride & { match_id: string }>();
    for (const r of results) {
      const arr = out.get(r.match_id) ?? [];
      arr.push({
        line: r.line.toUpperCase(),
        scheduled_date: r.scheduled_date,
        scheduled_time: r.scheduled_time,
      });
      out.set(r.match_id, arr);
    }
  } catch {
    // Table may not exist yet.
  }
  return out;
}

export function resolveLineSlot(
  defaults: MatchScheduleDefaults,
  overrides: LineScheduleOverride[],
  line: LineId,
): ResolvedSlot {
  const upper = line.toUpperCase();
  const o = overrides.find((x) => x.line.toUpperCase() === upper);
  return {
    date: o?.scheduled_date ?? defaults.match_date,
    time: o?.scheduled_time ?? defaults.match_time,
  };
}

export function groupLinesBySlot(
  defaults: MatchScheduleDefaults,
  overrides: LineScheduleOverride[],
  format: MatchFormat,
): ScheduleBlock[] {
  const lines = allLinesForFormat(format);
  const map = new Map<string, ScheduleBlock>();
  for (const line of lines) {
    const slot = resolveLineSlot(defaults, overrides, line);
    const key = `${slot.date}|${slot.time ?? ""}`;
    if (!map.has(key)) {
      map.set(key, { date: slot.date, time: slot.time, lines: [] });
    }
    map.get(key)!.lines.push(line);
  }
  return [...map.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time ?? "").localeCompare(b.time ?? "");
  });
}

export function isSplitSchedule(
  defaults: MatchScheduleDefaults,
  overrides: LineScheduleOverride[],
  format: MatchFormat,
): boolean {
  const blocks = groupLinesBySlot(defaults, overrides, format);
  const distinctDates = new Set(blocks.map((b) => b.date));
  return distinctDates.size > 1;
}

export function earliestSlotDate(
  defaults: MatchScheduleDefaults,
  overrides: LineScheduleOverride[],
  format: MatchFormat,
): string {
  const blocks = groupLinesBySlot(defaults, overrides, format);
  return blocks.reduce((min, b) => (b.date < min ? b.date : min), defaults.match_date);
}

export function latestSlotDate(
  defaults: MatchScheduleDefaults,
  overrides: LineScheduleOverride[],
  format: MatchFormat,
): string {
  const blocks = groupLinesBySlot(defaults, overrides, format);
  return blocks.reduce((max, b) => (b.date > max ? b.date : max), defaults.match_date);
}

export function describeLines(lines: LineId[]): string {
  const doubles = lines.filter((l) => l.startsWith("D")).map((l) => l.slice(1)).sort();
  const singles = lines.filter((l) => l.startsWith("S")).map((l) => l.slice(1)).sort();
  const parts: string[] = [];
  if (doubles.length === 1) parts.push(`Doubles ${doubles[0]}`);
  else if (doubles.length > 1) parts.push(`Doubles ${doubles.join(", ")}`);
  if (singles.length === 1) parts.push(`Singles ${singles[0]}`);
  else if (singles.length > 1) parts.push(`Singles ${singles.join(", ")}`);
  return parts.join(" · ");
}

export function describeLinesShort(lines: LineId[]): string {
  const sorted = [...lines].sort((a, b) => {
    // Doubles before singles, then by number
    const aD = a.startsWith("D") ? 0 : 1;
    const bD = b.startsWith("D") ? 0 : 1;
    if (aD !== bD) return aD - bD;
    return a.localeCompare(b);
  });
  return sorted.join("/");
}

export function formatSlotDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatSlotDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatSlotTime(time: string | null): string {
  if (!time) return "TBD";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Replace all line overrides for a match. Rows that match the default
 * date+time are dropped so the override table only stores actual divergences.
 */
export async function replaceLineSchedules(
  db: D1Database,
  matchId: string,
  defaults: MatchScheduleDefaults,
  overrides: Array<{ line: LineId; scheduled_date: string | null; scheduled_time: string | null }>,
): Promise<void> {
  await db
    .prepare("DELETE FROM match_line_schedules WHERE match_id = ?")
    .bind(matchId)
    .run();

  const toInsert = overrides
    .map((o) => ({
      line: o.line.toUpperCase(),
      scheduled_date: o.scheduled_date || null,
      scheduled_time: o.scheduled_time || null,
    }))
    .filter((o) => {
      // Skip if both fields are null (pure inherit)
      if (!o.scheduled_date && !o.scheduled_time) return false;
      // Skip if values match defaults (no actual override)
      const dateMatches = !o.scheduled_date || o.scheduled_date === defaults.match_date;
      const timeMatches = !o.scheduled_time || o.scheduled_time === defaults.match_time;
      return !(dateMatches && timeMatches);
    });

  if (toInsert.length === 0) return;

  const stmts = toInsert.map((o) =>
    db
      .prepare(
        "INSERT INTO match_line_schedules (match_id, line, scheduled_date, scheduled_time) VALUES (?, ?, ?, ?)",
      )
      .bind(matchId, o.line, o.scheduled_date, o.scheduled_time),
  );
  await db.batch(stmts);
}

/**
 * Best-effort parser of USTA-style notes into per-line time overrides.
 *
 * Handles shapes like:
 *   "S1 & D1 & D2: 6:30 PM, D3 & S2: 8:00 PM"
 *   "D1, D2, D3 at 6:00pm; S1, S2 at 8:00pm"
 *   "6:30 PM for D1/D2/D3 and 8:00 PM for S1/S2"
 *
 * Returns time-only overrides. USTA never reschedules to a different date in
 * the notes field, so `scheduled_date` is always left null (inherits match_date).
 */
export function parseUstaNotesToLineTimes(
  notes: string | null,
): Array<{ line: LineId; scheduled_time: string }> {
  if (!notes) return [];
  const out = new Map<LineId, string>();

  const toTime24 = (hStr: string, minStr: string | undefined, ampm: string): string => {
    let h = parseInt(hStr, 10);
    const min = parseInt(minStr ?? "00", 10);
    const up = ampm.toUpperCase();
    if (up === "PM" && h < 12) h += 12;
    else if (up === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  const lineTokenGroup = "[SD]\\d[AB]?";
  const separators = "\\s*(?:&|,|and|\\/|\\+)\\s*";
  const linesList = `(?:${lineTokenGroup}(?:${separators}${lineTokenGroup})*)`;
  const timePart = "(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM|am|pm)";

  // Pattern A: "<lines> [at|:] <time>"
  const reA = new RegExp(`(${linesList})\\s*(?:at|[:\\-–])\\s*${timePart}`, "g");
  // Pattern B: "<time> for <lines>"
  const reB = new RegExp(`${timePart}\\s+for\\s+(${linesList})`, "g");

  const extract = (linesStr: string, time24: string) => {
    const ids = linesStr
      .split(new RegExp(separators, "i"))
      .map((s) => s.trim().toUpperCase().replace(/[AB]$/i, ""))
      .filter((s) => /^[SD]\d$/.test(s));
    for (const line of ids) {
      if (!out.has(line)) out.set(line, time24);
    }
  };

  let m;
  while ((m = reA.exec(notes)) !== null) {
    extract(m[1], toTime24(m[2], m[3], m[4]));
  }
  while ((m = reB.exec(notes)) !== null) {
    extract(m[4], toTime24(m[1], m[2], m[3]));
  }

  return [...out.entries()].map(([line, scheduled_time]) => ({ line, scheduled_time }));
}
