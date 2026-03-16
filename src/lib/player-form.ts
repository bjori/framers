import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/lib/db";

async function callGpt(systemPrompt: string, userContent: string, maxTokens = 120): Promise<string> {
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
      console.error("[FORM] GPT call failed:", await res.text());
      return "";
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    console.error("[FORM] GPT error:", e);
    return "";
  }
}

const SYSTEM_PROMPT = `You write one-sentence form summaries for players in the Greenbrook Framers tennis community. Be specific about recent results — mention opponents by first name, set scores, streaks, and form direction (improving, slumping, dominant, grinding). Be punchy and conversational, like a sports radio host. No emojis. One sentence only, under 30 words.`;

export async function generateTournamentForm(playerId: string): Promise<string> {
  const db = await getDB();

  const player = await db.prepare("SELECT name FROM players WHERE id = ?").bind(playerId).first<{ name: string }>();
  if (!player) return "";

  // Last 5 tournament matches
  const matches = (
    await db
      .prepare(
        `SELECT tm.winner_participant_id, tm.score1_sets, tm.score2_sets, tm.week,
                tp1.player_id as p1_pid, tp2.player_id as p2_pid,
                p1.name as p1_name, p2.name as p2_name,
                tp1.id as tp1_id
         FROM tournament_matches tm
         JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
         JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
         JOIN players p1 ON p1.id = tp1.player_id
         JOIN players p2 ON p2.id = tp2.player_id
         WHERE tm.status = 'completed' AND tm.bye = 0
           AND (tp1.player_id = ? OR tp2.player_id = ?)
         ORDER BY tm.week DESC, tm.updated_at DESC
         LIMIT 5`
      )
      .bind(playerId, playerId)
      .all<{
        winner_participant_id: string; score1_sets: string; score2_sets: string;
        week: number; p1_pid: string; p2_pid: string; p1_name: string; p2_name: string; tp1_id: string;
      }>()
  ).results;

  if (matches.length === 0) return "";

  // Current standings position
  const standing = await db
    .prepare(
      `SELECT COUNT(*) + 1 as rank FROM (
        SELECT tp2.player_id,
               SUM(CASE WHEN tm.winner_participant_id = tp2.id THEN 1 ELSE 0 END) as wins
        FROM tournament_participants tp2
        JOIN tournament_matches tm ON (tm.participant1_id = tp2.id OR tm.participant2_id = tp2.id)
          AND tm.status = 'completed' AND tm.bye = 0
        WHERE tp2.tournament_id = (
          SELECT tournament_id FROM tournament_participants WHERE player_id = ? LIMIT 1
        )
        GROUP BY tp2.player_id
        HAVING wins > (
          SELECT SUM(CASE WHEN tm2.winner_participant_id = tp3.id THEN 1 ELSE 0 END)
          FROM tournament_participants tp3
          JOIN tournament_matches tm2 ON (tm2.participant1_id = tp3.id OR tm2.participant2_id = tp3.id)
            AND tm2.status = 'completed' AND tm2.bye = 0
          WHERE tp3.player_id = ?
        )
      )`
    )
    .bind(playerId, playerId)
    .first<{ rank: number }>();

  const recentResults = matches.map((m) => {
    const isP1 = m.p1_pid === playerId;
    const won = isP1
      ? m.winner_participant_id === m.tp1_id
      : m.winner_participant_id !== m.tp1_id;
    const opponent = isP1 ? m.p2_name : m.p1_name;
    let s1: number[] = [], s2: number[] = [];
    try { s1 = JSON.parse(m.score1_sets); } catch { /* empty */ }
    try { s2 = JSON.parse(m.score2_sets); } catch { /* empty */ }
    const score = s1.map((g, i) => `${g}-${s2[i] ?? 0}`).join(", ");
    return `Week ${m.week}: ${won ? "W" : "L"} vs ${opponent.split(" ")[0]} (${score})`;
  });

  const prompt = JSON.stringify({
    player: player.name.split(" ")[0],
    standingsPosition: standing?.rank ?? "?",
    recentMatches: recentResults,
  });

  const form = await callGpt(SYSTEM_PROMPT, prompt);
  if (!form) return "";

  await db
    .prepare("UPDATE players SET tournament_form = ?, form_updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
    .bind(form, playerId)
    .run();

  return form;
}

export async function generateLeagueForm(playerId: string): Promise<string> {
  const db = await getDB();

  const player = await db
    .prepare("SELECT name, tennisrecord_rating FROM players WHERE id = ?")
    .bind(playerId)
    .first<{ name: string; tennisrecord_rating: number | null }>();
  if (!player) return "";

  // Last 5 league match results for this player
  const results = (
    await db
      .prepare(
        `SELECT lmr.position, lmr.won, lmr.our_score, lmr.opp_score, lmr.is_default_win,
                lm.opponent_team, lm.match_date,
                p2.name as partner_name
         FROM league_match_results lmr
         JOIN league_matches lm ON lm.id = lmr.match_id
         LEFT JOIN players p2 ON p2.id = lmr.player2_id AND lmr.player2_id != ?
         WHERE (lmr.player1_id = ? OR lmr.player2_id = ?)
           AND lm.status = 'completed'
         ORDER BY lm.match_date DESC
         LIMIT 5`
      )
      .bind(playerId, playerId, playerId)
      .all<{
        position: string; won: number; our_score: string | null; opp_score: string | null;
        is_default_win: number; opponent_team: string; match_date: string; partner_name: string | null;
      }>()
  ).results;

  if (results.length === 0) return "";

  const recentResults = results.map((r) => {
    const scoreStr = r.our_score && r.opp_score
      ? r.our_score.split(",").map((s, i) => `${s}-${r.opp_score!.split(",")[i] ?? ""}`).join(", ")
      : r.is_default_win ? "Default" : "?";
    const partnerStr = r.partner_name ? ` w/ ${r.partner_name.split(" ")[0]}` : "";
    return `${r.match_date}: ${r.won ? "W" : "L"} at ${r.position}${partnerStr} vs ${r.opponent_team} (${scoreStr})`;
  });

  const prompt = JSON.stringify({
    player: player.name.split(" ")[0],
    trRating: player.tennisrecord_rating,
    recentLeagueMatches: recentResults,
  });

  const form = await callGpt(SYSTEM_PROMPT, prompt);
  if (!form) return "";

  await db
    .prepare("UPDATE players SET league_form = ?, form_updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
    .bind(form, playerId)
    .run();

  return form;
}
