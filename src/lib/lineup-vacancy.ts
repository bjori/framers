import {
  describeVacantStarterLines,
  expectedStarterPositions,
  vacantStarterPositionsFromPayload,
} from "@/lib/lineup-positions";

/** Default NorCal-style card: 3 doubles lines + 2 singles = 8 starters. */
const DEFAULT_FORMAT = { singles: 1, doubles: 3 } as const;

/**
 * Parse `teams.match_format` JSON. Malformed/null values must never throw — cron and UI depend on this.
 */
export function starterFormatFromTeamJson(
  matchFormatJson: string | null | undefined,
): { singles: number; doubles: number } {
  const raw = matchFormatJson;
  if (raw == null || typeof raw !== "string" || raw.trim() === "") {
    return { ...DEFAULT_FORMAT };
  }
  try {
    const format = JSON.parse(raw) as unknown;
    if (!format || typeof format !== "object" || Array.isArray(format)) {
      return { ...DEFAULT_FORMAT };
    }
    const o = format as Record<string, unknown>;
    const singlesRaw =
      typeof o.singles === "number" && Number.isFinite(o.singles) ? Math.max(0, Math.floor(o.singles)) : null;
    const doublesRaw =
      typeof o.doubles === "number" && Number.isFinite(o.doubles) ? Math.max(0, Math.floor(o.doubles)) : null;
    return {
      singles: singlesRaw === null ? DEFAULT_FORMAT.singles : singlesRaw,
      doubles: doublesRaw === null ? DEFAULT_FORMAT.doubles : doublesRaw,
    };
  } catch {
    return { ...DEFAULT_FORMAT };
  }
}

export function neededStarterCount(matchFormatJson: string | null | undefined): number {
  const f = starterFormatFromTeamJson(matchFormatJson);
  return f.singles + f.doubles * 2;
}

/** From DB starter rows (may omit empty positions); returns e.g. "Doubles 3" or null if card is full. */
export function vacantLinesLabelFromStarterSlots(
  rawStarterSlots: { position: string; player_id: string | null }[],
  format: { singles: number; doubles: number },
): string | null {
  const byPos = new Map(rawStarterSlots.map((r) => [r.position, r]));
  const slotsForVacancy = expectedStarterPositions(format).map((position) => ({
    position,
    playerId: byPos.get(position)?.player_id ?? null,
  }));
  const vacant = vacantStarterPositionsFromPayload(slotsForVacancy, format);
  return vacant.length > 0 ? describeVacantStarterLines(vacant) : null;
}

export async function vacantLinesLabelForLeagueMatch(
  db: D1Database,
  matchId: string,
  matchFormatJson: string | null | undefined,
): Promise<string | null> {
  const starterFmt = starterFormatFromTeamJson(matchFormatJson);
  const lineup = await db.prepare("SELECT id FROM lineups WHERE match_id = ?").bind(matchId).first<{ id: string }>();
  if (!lineup) return null;
  const raw = (
    await db
      .prepare(
        `SELECT ls.position, ls.player_id FROM lineup_slots ls
         WHERE ls.lineup_id = ? AND ls.is_alternate = 0`,
      )
      .bind(lineup.id)
      .all<{ position: string; player_id: string | null }>()
  ).results;
  return vacantLinesLabelFromStarterSlots(raw, starterFmt);
}
