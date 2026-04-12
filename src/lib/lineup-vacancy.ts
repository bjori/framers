import {
  describeVacantStarterLines,
  expectedStarterPositions,
  vacantStarterPositionsFromPayload,
} from "@/lib/lineup-positions";

export function starterFormatFromTeamJson(matchFormatJson: string): { singles: number; doubles: number } {
  const format = JSON.parse(matchFormatJson || "{}");
  return { singles: format.singles ?? 1, doubles: format.doubles ?? 3 };
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
  matchFormatJson: string,
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
