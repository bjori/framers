import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/lib/db";

export interface LineInsight {
  position: string;
  players: string;
  insight: string;
}

export interface MatchPreview {
  quip: string;
  lineInsights: LineInsight[];
  generatedAt: string;
}

async function callGpt(systemPrompt: string, userContent: string, maxTokens = 500): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return "";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.85,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[MATCH-PREVIEW] GPT call failed:", await res.text());
      return "";
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    console.error("[MATCH-PREVIEW] GPT error:", e);
    return "";
  }
}

/**
 * Generate a match preview for an upcoming league match that has a confirmed lineup.
 * Returns null if no lineup is confirmed or GPT fails.
 */
export async function generateMatchPreview(matchId: string): Promise<MatchPreview | null> {
  const db = await getDB();

  const match = await db.prepare(
    `SELECT lm.id, lm.opponent_team, lm.match_date, lm.is_home, lm.location, lm.notes,
            t.name as team_name, t.slug as team_slug
     FROM league_matches lm
     JOIN teams t ON t.id = lm.team_id
     WHERE lm.id = ?`
  ).bind(matchId).first<{
    id: string; opponent_team: string; match_date: string; is_home: number;
    location: string | null; notes: string | null;
    team_name: string; team_slug: string;
  }>();

  if (!match) return null;

  const lineup = await db.prepare(
    `SELECT l.id as lineup_id, l.status as lineup_status FROM lineups l WHERE l.match_id = ?`
  ).bind(matchId).first<{ lineup_id: string; lineup_status: string }>();

  if (!lineup) return null;

  const slots = (await db.prepare(
    `SELECT ls.position, ls.player_id, ls.is_alternate, ls.acknowledged,
            p.name, p.singles_elo, p.doubles_elo, p.ntrp_type,
            p.tennisrecord_rating, p.league_form
     FROM lineup_slots ls
     JOIN players p ON p.id = ls.player_id
     WHERE ls.lineup_id = ? AND ls.is_alternate = 0
     ORDER BY ls.position`
  ).bind(lineup.lineup_id).all<{
    position: string; player_id: string; is_alternate: number; acknowledged: number | null;
    name: string; singles_elo: number; doubles_elo: number; ntrp_type: string;
    tennisrecord_rating: number | null; league_form: string | null;
  }>()).results;

  if (slots.length === 0) return null;

  // Season record
  const seasonRecord = await db.prepare(
    `SELECT COUNT(CASE WHEN team_result = 'Won' THEN 1 END) as wins,
            COUNT(CASE WHEN team_result = 'Lost' THEN 1 END) as losses
     FROM league_matches WHERE team_id = (SELECT team_id FROM league_matches WHERE id = ?) AND status = 'completed'`
  ).bind(matchId).first<{ wins: number; losses: number }>();

  // Check which doubles pairings have played together before
  const pairHistory: Record<string, number> = {};
  const doublesSlots = slots.filter((s) => s.position.startsWith("D"));
  const positionGroups = new Map<string, typeof slots>();
  for (const s of doublesSlots) {
    const pos = s.position.replace(/[ab]$/i, "");
    if (!positionGroups.has(pos)) positionGroups.set(pos, []);
    positionGroups.get(pos)!.push(s);
  }

  for (const [pos, pair] of positionGroups) {
    if (pair.length === 2) {
      const count = (await db.prepare(
        `SELECT COUNT(*) as cnt FROM league_match_results
         WHERE (player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?)
           AND match_id IN (SELECT id FROM league_matches WHERE status = 'completed')`
      ).bind(pair[0].player_id, pair[1].player_id, pair[1].player_id, pair[0].player_id)
        .first<{ cnt: number }>())?.cnt ?? 0;
      pairHistory[pos] = count;
    }
  }

  // Opponent scouting data if available
  const oppPlayers = (await db.prepare(
    `SELECT player_name, tr_dynamic_rating, season_record, current_streak
     FROM tr_players WHERE team_name LIKE ? ORDER BY tr_dynamic_rating DESC LIMIT 7`
  ).bind(`%${match.opponent_team}%`).all<{
    player_name: string; tr_dynamic_rating: number | null;
    season_record: string | null; current_streak: string | null;
  }>()).results;

  // Check if first away game
  const awayCount = (await db.prepare(
    `SELECT COUNT(*) as cnt FROM league_matches
     WHERE team_id = (SELECT team_id FROM league_matches WHERE id = ?)
       AND is_home = 0 AND status = 'completed'`
  ).bind(matchId).first<{ cnt: number }>())?.cnt ?? 0;
  const isFirstAway = !match.is_home && awayCount === 0;

  // Build per-line data for GPT
  const lineData = [];
  for (const s of slots) {
    const pos = s.position.replace(/[ab]$/i, "");
    const isDoubles = s.position.startsWith("D");
    const partnerSlot = isDoubles
      ? slots.find((x) => x.position !== s.position && x.position.replace(/[ab]$/i, "") === pos)
      : null;

    lineData.push({
      position: s.position,
      player: s.name,
      elo: isDoubles ? s.doubles_elo : s.singles_elo,
      ntrp: s.ntrp_type,
      trRating: s.tennisrecord_rating,
      form: s.league_form,
      partner: partnerSlot?.name ?? null,
      pairMatchesTogether: isDoubles ? (pairHistory[pos] ?? 0) : null,
    });
  }

  const promptData = {
    teamName: match.team_name,
    opponent: match.opponent_team,
    matchDate: match.match_date,
    isHome: !!match.is_home,
    isFirstAway,
    seasonRecord: seasonRecord ? `${seasonRecord.wins}-${seasonRecord.losses}` : "0-0",
    lineupStatus: lineup.lineup_status,
    lineup: lineData,
    opponentScouting: oppPlayers.length > 0
      ? oppPlayers.map((p) => ({
          name: p.player_name,
          rating: p.tr_dynamic_rating,
          record: p.season_record,
          streak: p.current_streak,
        }))
      : null,
  };

  const system = `You generate match previews for the Greenbrook Framers, a neighborhood USTA 3.0 tennis team. Respond ONLY with valid JSON (no markdown fences). The JSON must have:
{
  "quip": "A 1-2 sentence overall match preview/quip. Bold, fun, sports-commentary style. Reference the opponent, home/away, and season stakes.",
  "lineInsights": [
    { "position": "D1", "players": "Player A & Player B", "insight": "One punchy sentence about this line" }
  ]
}

For lineInsights, generate exactly one entry per doubles position (combining both partners) and one per singles position. Focus on:
- New pairings that have never played together (pairMatchesTogether = 0)
- Players on hot streaks or cold runs (check their form summaries)
- Rating mismatches vs likely opponents
- First away game of the season
- Interesting narratives (comeback stories, reliable anchors, etc.)

Keep each insight to one sentence, under 20 words. Use first names only. Be entertaining but not cheesy. No emojis.`;

  const gptResponse = await callGpt(system, JSON.stringify(promptData));
  if (!gptResponse) return null;

  try {
    const cleaned = gptResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { quip: string; lineInsights: LineInsight[] };

    const preview: MatchPreview = {
      quip: parsed.quip,
      lineInsights: parsed.lineInsights || [],
      generatedAt: new Date().toISOString(),
    };

    await db.prepare(
      "UPDATE league_matches SET pre_match_preview = ? WHERE id = ?"
    ).bind(JSON.stringify(preview), matchId).run();

    return preview;
  } catch (e) {
    console.error("[MATCH-PREVIEW] Failed to parse GPT response:", e, gptResponse);
    return null;
  }
}
