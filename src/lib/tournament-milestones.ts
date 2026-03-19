/**
 * Detect notable milestones from a completed tournament match.
 * Used for the daily milestone digest — broadcast highlights before the weekly summary.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

interface Standing {
  participant_id: string;
  player_id: string;
  name: string;
  wins: number;
  losses: number;
}

interface MatchRow {
  id: string;
  participant1_id: string;
  participant2_id: string;
  winner_participant_id: string | null;
  score1_sets: string | null;
  score2_sets: string | null;
  status: string;
  p1_name: string;
  p2_name: string;
  p1_player_id: string;
  p2_player_id: string;
}

export type MilestoneType = "first_win" | "last_place_secured" | "upset";

export interface Milestone {
  type: MilestoneType;
  headline: string;
  playerName: string;
  opponentName?: string;
  score?: string;
}

function parseScore(s: string | null): number[] {
  if (!s) return [];
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

function formatScore(
  s1: string | null,
  s2: string | null,
  winnerId: string | null,
  p1Id: string
): string {
  const sets1 = parseScore(s1);
  const sets2 = parseScore(s2);
  if (sets1.length === 0) return "";
  const isP1Winner = winnerId === p1Id;
  return sets1
    .map((g, i) => {
      const a = isP1Winner ? g : (sets2[i] ?? 0);
      const b = isP1Winner ? (sets2[i] ?? 0) : g;
      return `${a}-${b}`;
    })
    .join(", ");
}

function computeStandings(
  matches: { participant1_id: string; participant2_id: string; winner_participant_id: string | null; status: string }[],
  participants: { id: string; player_id: string; name: string }[]
): Map<string, Standing> {
  const map = new Map<string, Standing>();
  for (const p of participants) {
    map.set(p.id, {
      participant_id: p.id,
      player_id: p.player_id,
      name: p.name,
      wins: 0,
      losses: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_participant_id) continue;
    const p1 = map.get(m.participant1_id);
    const p2 = map.get(m.participant2_id);
    if (!p1 || !p2) continue;

    if (m.winner_participant_id === m.participant1_id) {
      p1.wins++;
      p2.losses++;
    } else {
      p2.wins++;
      p1.losses++;
    }
  }

  return map;
}

/**
 * Detect milestones for a completed tournament match.
 * Returns an array of milestones (first win, last place secured, upset).
 */
export async function detectMilestones(
  db: D1Database,
  matchId: string,
  tournamentSlug: string
): Promise<Milestone[]> {
  const match = await db
    .prepare(
      `SELECT tm.id, tm.participant1_id, tm.participant2_id, tm.winner_participant_id,
              tm.score1_sets, tm.score2_sets, tm.status,
              p1.name as p1_name, p2.name as p2_name,
              tp1.player_id as p1_player_id, tp2.player_id as p2_player_id
       FROM tournament_matches tm
       LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
       LEFT JOIN players p1 ON p1.id = tp1.player_id
       LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
       LEFT JOIN players p2 ON p2.id = tp2.player_id
       WHERE tm.id = ? AND tm.tournament_id = (SELECT id FROM tournaments WHERE slug = ?) AND tm.bye = 0`
    )
    .bind(matchId, tournamentSlug)
    .first<MatchRow>();

  // Pre-match ELO from elo_history (at time of score submission)
  const eloHistory = (
    await db
      .prepare(
        `SELECT player_id, old_elo FROM elo_history
         WHERE source = 'tournament_match' AND source_id = ? AND type = 'singles'`
      )
      .bind(matchId)
      .all<{ player_id: string; old_elo: number }>()
  ).results;
  const preMatchElo = new Map(eloHistory.map((e) => [e.player_id, e.old_elo]));

  if (!match || match.status !== "completed" || !match.winner_participant_id) {
    return [];
  }

  const tournament = await db
    .prepare("SELECT id FROM tournaments WHERE slug = ? AND status = 'active'")
    .bind(tournamentSlug)
    .first<{ id: string }>();
  if (!tournament) return [];

  const participants = (
    await db
      .prepare(
        `SELECT tp.id, tp.player_id, p.name
         FROM tournament_participants tp JOIN players p ON p.id = tp.player_id
         WHERE tp.tournament_id = ?`
      )
      .bind(tournament.id)
      .all<{ id: string; player_id: string; name: string }>()
  ).results;

  const allMatches = (
    await db
      .prepare(
        `SELECT id, participant1_id, participant2_id, winner_participant_id, status
         FROM tournament_matches
         WHERE tournament_id = ? AND bye = 0`
      )
      .bind(tournament.id)
      .all<{ id: string; participant1_id: string; participant2_id: string; winner_participant_id: string | null; status: string }>()
  ).results;

  // Standings BEFORE this match (exclude current match to get pre-match state)
  const standingsBefore = computeStandings(
    allMatches.filter((m) => m.id !== matchId),
    participants
  );

  const winnerIsP1 = match.winner_participant_id === match.participant1_id;
  const winnerParticipantId = match.winner_participant_id;
  const loserParticipantId = winnerIsP1 ? match.participant2_id : match.participant1_id;
  const winnerPlayerId = winnerIsP1 ? match.p1_player_id : match.p2_player_id;
  const loserPlayerId = winnerIsP1 ? match.p2_player_id : match.p1_player_id;
  const winnerName = winnerIsP1 ? match.p1_name : match.p2_name;
  const loserName = winnerIsP1 ? match.p2_name : match.p1_name;
  const winnerElo = preMatchElo.get(winnerPlayerId) ?? 1500;
  const loserElo = preMatchElo.get(loserPlayerId) ?? 1500;
  const score = formatScore(
    match.score1_sets,
    match.score2_sets,
    match.winner_participant_id,
    match.participant1_id
  );

  const milestones: Milestone[] = [];

  // First win: winner had 0 wins before this match
  const winnerStandingBefore = standingsBefore.get(winnerParticipantId);
  if (winnerStandingBefore && winnerStandingBefore.wins === 0) {
    milestones.push({
      type: "first_win",
      headline: `${winnerName.split(" ")[0]} got their first win!`,
      playerName: winnerName,
      opponentName: loserName,
      score,
    });
  }

  // Upset: loser had higher ELO than winner (by 50+ points)
  if (loserElo > winnerElo + 50) {
    milestones.push({
      type: "upset",
      headline: `${winnerName.split(" ")[0]} pulled off an upset over ${loserName.split(" ")[0]}!`,
      playerName: winnerName,
      opponentName: loserName,
      score,
    });
  }

  // Last place secured: loser is now in last place with 2+ more losses than 2nd-to-last
  const standingsAfter = computeStandings(
    allMatches.filter((m) => m.status === "completed"),
    participants
  );
  const sorted = Array.from(standingsAfter.values()).sort((a, b) => {
    if (a.losses !== b.losses) return b.losses - a.losses; // more losses = worse
    return a.wins - b.wins; // fewer wins = worse
  });
  const lastPlace = sorted[sorted.length - 1];
  const secondLast = sorted[sorted.length - 2];
  if (
    lastPlace &&
    secondLast &&
    lastPlace.participant_id === loserParticipantId &&
    lastPlace.losses >= secondLast.losses + 2
  ) {
    milestones.push({
      type: "last_place_secured",
      headline: `${loserName.split(" ")[0]} has all but secured the last-place cash prize!`,
      playerName: loserName,
      opponentName: winnerName,
      score,
    });
  }

  return milestones;
}

/**
 * Generate an enthusiastic AI quip for the milestone digest.
 * Style: Mexican soccer commentator or Vegas boxing announcer — over-the-top, exciting.
 */
export async function generateMilestoneDigestQuip(
  milestones: Milestone[],
  tournamentName: string
): Promise<string> {
  if (milestones.length === 0) return "";

  try {
    const { env } = await getCloudflareContext({ async: true });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return "";

    const milestoneSummaries = milestones.map((m) => ({
      type: m.type,
      headline: m.headline,
      player: m.playerName.split(" ")[0],
      opponent: m.opponentName?.split(" ")[0],
      score: m.score,
    }));

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `You are an extremely enthusiastic Mexican soccer commentator OR a Vegas boxing ring announcer. You're announcing highlights from a neighborhood tennis tournament. Be over-the-top, dramatic, and fun. Use exclamation points! Keep it to 1-2 short sentences. No emojis. Use player first names only.`,
          },
          {
            role: "user",
            content: `Tournament: ${tournamentName}. Highlights to announce: ${JSON.stringify(milestoneSummaries)}. Write one punchy, exciting intro line.`,
          },
        ],
      }),
    });

    if (!res.ok) return "";
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = json.choices[0]?.message?.content?.trim();
    return text ? `<p style="font-style: italic; color: #64748b; margin-bottom: 16px;">${text}</p>` : "";
  } catch (e) {
    console.error("[Milestone quip]", e);
    return "";
  }
}
