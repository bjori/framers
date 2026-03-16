import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/lib/db";

// ── ELO-based win probability ──────────────────────────────────────

export function calculateWinProbability(p1Elo: number, p2Elo: number): number {
  return 1 / (1 + Math.pow(10, (p2Elo - p1Elo) / 400));
}

// ── GPT quip generation ────────────────────────────────────────────

async function callGpt(systemPrompt: string, userContent: string): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return "";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        max_tokens: 100,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[PREDICTIONS] GPT call failed:", await res.text());
      return "";
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    console.error("[PREDICTIONS] GPT error:", e);
    return "";
  }
}

const QUIP_SYSTEM = `You write short, entertaining match previews for the Greenbrook Singles World Championships — an internal tennis tournament in San Ramon, CA. Write in a gambling/sports-commentary style. Use first names only. Include the win probability naturally. One or two sentences max, under 35 words. No emojis. Be bold with your takes — pick a side, call out streaks, rivalries, and upsets waiting to happen.`;

interface PlayerMatchData {
  name: string;
  elo: number;
  record: string;
  form: string | null;
  h2hInTournament: { won: boolean; score: string; week: number }[];
}

export async function generateMatchQuip(
  winProb: number,
  p1: PlayerMatchData,
  p2: PlayerMatchData,
): Promise<string> {
  const favored = winProb >= 0.5 ? p1 : p2;
  const underdog = winProb >= 0.5 ? p2 : p1;
  const pct = Math.round(Math.max(winProb, 1 - winProb) * 100);

  const prompt = JSON.stringify({
    favorite: { name: favored.name.split(" ")[0], elo: favored.elo, record: favored.record, form: favored.form },
    underdog: { name: underdog.name.split(" ")[0], elo: underdog.elo, record: underdog.record, form: underdog.form },
    winProbability: `${pct}%`,
    headToHead: p1.h2hInTournament.length > 0
      ? p1.h2hInTournament.map((h) => `Week ${h.week}: ${h.won ? p1.name.split(" ")[0] : p2.name.split(" ")[0]} won ${h.score}`)
      : "First meeting this season",
  });

  return callGpt(QUIP_SYSTEM, prompt);
}

// ── Regenerate all quips for a tournament ──────────────────────────

export async function regenerateAllQuips(tournamentId: string): Promise<number> {
  const db = await getDB();

  // Get all scheduled (not completed, not bye) matches
  const matches = (
    await db
      .prepare(
        `SELECT tm.id, tm.participant1_id, tm.participant2_id, tm.week,
                tp1.player_id as p1_pid, tp2.player_id as p2_pid,
                p1.name as p1_name, p1.singles_elo as p1_elo, p1.tournament_form as p1_form,
                p2.name as p2_name, p2.singles_elo as p2_elo, p2.tournament_form as p2_form
         FROM tournament_matches tm
         JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
         JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
         JOIN players p1 ON p1.id = tp1.player_id
         JOIN players p2 ON p2.id = tp2.player_id
         WHERE tm.tournament_id = ? AND tm.status = 'scheduled' AND tm.bye = 0
         ORDER BY tm.week, tm.match_number`
      )
      .bind(tournamentId)
      .all<{
        id: string; participant1_id: string; participant2_id: string; week: number;
        p1_pid: string; p2_pid: string;
        p1_name: string; p1_elo: number; p1_form: string | null;
        p2_name: string; p2_elo: number; p2_form: string | null;
      }>()
  ).results;

  if (matches.length === 0) return 0;

  // Pre-compute standings for records
  const standings = (
    await db
      .prepare(
        `SELECT tp.id as tp_id, tp.player_id,
                SUM(CASE WHEN tm.winner_participant_id = tp.id THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN tm.winner_participant_id IS NOT NULL AND tm.winner_participant_id != tp.id THEN 1 ELSE 0 END) as losses
         FROM tournament_participants tp
         JOIN tournament_matches tm ON (tm.participant1_id = tp.id OR tm.participant2_id = tp.id)
           AND tm.status = 'completed' AND tm.bye = 0
         WHERE tp.tournament_id = ?
         GROUP BY tp.id`
      )
      .bind(tournamentId)
      .all<{ tp_id: string; player_id: string; wins: number; losses: number }>()
  ).results;

  const recordMap = new Map(standings.map((s) => [s.tp_id, `${s.wins}-${s.losses}`]));

  // Pre-compute head-to-head for all match pairs
  const h2hCache = new Map<string, { won: boolean; score: string; week: number }[]>();

  for (const m of matches) {
    const key = `${m.participant1_id}::${m.participant2_id}`;
    if (!h2hCache.has(key)) {
      const h2h = (
        await db
          .prepare(
            `SELECT winner_participant_id, score1_sets, score2_sets, week
             FROM tournament_matches
             WHERE tournament_id = ? AND status = 'completed' AND bye = 0
               AND ((participant1_id = ? AND participant2_id = ?) OR (participant1_id = ? AND participant2_id = ?))
             ORDER BY week`
          )
          .bind(tournamentId, m.participant1_id, m.participant2_id, m.participant2_id, m.participant1_id)
          .all<{ winner_participant_id: string; score1_sets: string; score2_sets: string; week: number }>()
      ).results;

      h2hCache.set(
        key,
        h2h.map((h) => {
          let s1: number[] = [], s2: number[] = [];
          try { s1 = JSON.parse(h.score1_sets); } catch { /* empty */ }
          try { s2 = JSON.parse(h.score2_sets); } catch { /* empty */ }
          const score = s1.map((g, i) => `${g}-${s2[i] ?? 0}`).join(", ");
          return { won: h.winner_participant_id === m.participant1_id, score, week: h.week };
        })
      );
    }
  }

  let generated = 0;

  for (const m of matches) {
    const winProb = calculateWinProbability(m.p1_elo, m.p2_elo);
    const h2hKey = `${m.participant1_id}::${m.participant2_id}`;
    const h2h = h2hCache.get(h2hKey) ?? [];

    const quip = await generateMatchQuip(
      winProb,
      { name: m.p1_name, elo: m.p1_elo, record: recordMap.get(m.participant1_id) ?? "0-0", form: m.p1_form, h2hInTournament: h2h },
      { name: m.p2_name, elo: m.p2_elo, record: recordMap.get(m.participant2_id) ?? "0-0", form: m.p2_form, h2hInTournament: h2h.map((h) => ({ ...h, won: !h.won })) },
    );

    await db
      .prepare(
        `UPDATE tournament_matches
         SET win_probability = ?, pre_match_quip = ?, quip_updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
         WHERE id = ?`
      )
      .bind(winProb, quip || null, m.id)
      .run();

    generated++;
  }

  return generated;
}
