import { getCloudflareContext } from "@opennextjs/cloudflare";

interface SeasonContext {
  teamName: string;
  opponentTeam: string;
  seasonRecord: { wins: number; losses: number; total: number };
  pastResults: { team_score: string; team_result: string; match_date: string }[];
  isHome: boolean;
  isFinalMatch: boolean;
  matchDate: string;
}

interface LineupPlayer {
  name: string;
  position: string;
}

interface OpponentScouting {
  players: { name: string; rating: number; record: string; streak?: string | null; avgOppRating?: number | null }[];
  predictedScore?: string;
  headToHead?: { ourPlayer: string; opponent: string; result: string; score: string; date: string }[];
}

interface PreMatchData extends SeasonContext {
  lineup: LineupPlayer[];
  remainingMatches: number;
  scouting?: OpponentScouting;
}

interface LineResult {
  position: string;
  players: string;
  won: boolean;
  score: string;
  isDefault: boolean;
}

interface PostMatchData extends SeasonContext {
  teamScore: string;
  teamResult: string;
  lineResults: LineResult[];
  scouting?: OpponentScouting;
}

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
        temperature: 0.85,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[COMMENTARY] GPT call failed:", await res.text());
      return "";
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content ?? "";
  } catch (e) {
    console.error("[COMMENTARY] GPT error:", e);
    return "";
  }
}

export async function generatePreMatchCommentary(data: PreMatchData): Promise<string> {
  const scoutingInstructions = data.scouting
    ? `\n- If opponent scouting data is provided, weave in insights about their strengths/weaknesses (e.g. "Their top player is rated 3.01 — the strongest on either side")
- If a predicted score is given, mention it casually (e.g. "Ratings suggest this could go 3-2 our way")
- If head-to-head history with specific opponents is provided, reference revenge opportunities or past battles`
    : "";

  const system = `You are the hype-man for the Greenbrook Framers, a neighborhood USTA tennis team in San Ramon, CA. Write a short, energizing pre-match preview for tomorrow's match. Be genuinely enthusiastic but not cheesy. Use first names for players when mentioning them. No emojis.

Write 2-3 short paragraphs in HTML using only <p> and <strong> tags. Keep it under 150 words. Include:
- A take on what this match means for the season (especially if it's the final match or a must-win)
- A nod to the head-to-head history if available
- A shoutout to the lineup if provided
- If it's the final match, make it feel like an occasion — mention the end-of-season celebration coming up${scoutingInstructions}`;

  const promptData: Record<string, unknown> = {
    teamName: data.teamName,
    opponent: data.opponentTeam,
    record: `${data.seasonRecord.wins}-${data.seasonRecord.losses}`,
    matchesPlayed: data.seasonRecord.total,
    remainingMatches: data.remainingMatches,
    isFinalMatch: data.isFinalMatch,
    isHome: data.isHome,
    pastResults: data.pastResults.map((r) => `${r.team_result} ${r.team_score}`),
    lineup: data.lineup.map((p) => `${p.position}: ${p.name}`),
  };

  if (data.scouting) {
    promptData.opponentScouting = {
      topPlayers: data.scouting.players.slice(0, 7).map((p) => ({
        name: p.name,
        rating: p.rating,
        record: p.record,
        streak: p.streak,
        avgOppRating: p.avgOppRating,
      })),
      predictedScore: data.scouting.predictedScore,
      headToHead: data.scouting.headToHead?.slice(0, 5),
    };
  }

  return callGpt(system, JSON.stringify(promptData));
}

export async function generatePostMatchCommentary(data: PostMatchData): Promise<string> {
  const isWin = data.teamResult === "Won";
  const scoutingInstructions = data.scouting
    ? `\n- If opponent rating data is available, call out upsets: when our player beat a higher-rated opponent, that's impressive. When we lost to a lower-rated opponent, acknowledge the disappointment.
- If a predicted score was given, compare prediction vs reality (e.g. "We were projected to lose 2-3 but pulled off a surprise 4-1")
- If head-to-head history is available, mention revenge wins or repeated losses
- A 3-set loss against a stronger opponent is a gutsy performance worth highlighting`
    : "";

  const system = `You are the match reporter for the Greenbrook Framers, a neighborhood USTA tennis team in San Ramon, CA. Write a brief, engaging match recap. Be ${isWin ? "celebratory but classy" : "honest but encouraging"} in tone. Use first names for players. No emojis.

Write 2-3 short paragraphs in HTML using only <p> and <strong> tags. Keep it under 150 words. Include:
- The overall result and what it means for the season
- Call out standout individual performances (close wins, dominant victories, clutch matches)
- If the team lost, find something positive — a specific line that was competitive, a player who fought hard
- If it's the final match of the season, reflect briefly on the season as a whole
- If the team won the deciding point, highlight the drama${scoutingInstructions}`;

  const promptData: Record<string, unknown> = {
    teamName: data.teamName,
    opponent: data.opponentTeam,
    score: data.teamScore,
    result: data.teamResult,
    record: `${data.seasonRecord.wins}-${data.seasonRecord.losses}`,
    isFinalMatch: data.isFinalMatch,
    isHome: data.isHome,
    lines: data.lineResults.map((lr) => ({
      position: lr.position,
      players: lr.players,
      won: lr.won,
      score: lr.score,
      isDefault: lr.isDefault,
    })),
  };

  if (data.scouting) {
    promptData.opponentRatings = data.scouting.players.slice(0, 7).map((p) => ({
      name: p.name,
      rating: p.rating,
      record: p.record,
      streak: p.streak,
    }));
    promptData.predictedScore = data.scouting.predictedScore;
    promptData.headToHead = data.scouting.headToHead?.slice(0, 5);
  }

  return callGpt(system, JSON.stringify(promptData));
}
