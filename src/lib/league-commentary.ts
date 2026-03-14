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

interface PreMatchData extends SeasonContext {
  lineup: LineupPlayer[];
  remainingMatches: number;
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
  const system = `You are the hype-man for the Greenbrook Framers, a neighborhood USTA tennis team in San Ramon, CA. Write a short, energizing pre-match preview for tomorrow's match. Be genuinely enthusiastic but not cheesy. Use first names for players when mentioning them. No emojis.

Write 2-3 short paragraphs in HTML using only <p> and <strong> tags. Keep it under 150 words. Include:
- A take on what this match means for the season (especially if it's the final match or a must-win)
- A nod to the head-to-head history if available
- A shoutout to the lineup if provided
- If it's the final match, make it feel like an occasion — mention the end-of-season celebration coming up`;

  const prompt = JSON.stringify({
    teamName: data.teamName,
    opponent: data.opponentTeam,
    record: `${data.seasonRecord.wins}-${data.seasonRecord.losses}`,
    matchesPlayed: data.seasonRecord.total,
    remainingMatches: data.remainingMatches,
    isFinalMatch: data.isFinalMatch,
    isHome: data.isHome,
    pastResults: data.pastResults.map((r) => `${r.team_result} ${r.team_score}`),
    lineup: data.lineup.map((p) => `${p.position}: ${p.name}`),
  });

  return callGpt(system, prompt);
}

export async function generatePostMatchCommentary(data: PostMatchData): Promise<string> {
  const isWin = data.teamResult === "Won";
  const system = `You are the match reporter for the Greenbrook Framers, a neighborhood USTA tennis team in San Ramon, CA. Write a brief, engaging match recap. Be ${isWin ? "celebratory but classy" : "honest but encouraging"} in tone. Use first names for players. No emojis.

Write 2-3 short paragraphs in HTML using only <p> and <strong> tags. Keep it under 150 words. Include:
- The overall result and what it means for the season
- Call out standout individual performances (close wins, dominant victories, clutch matches)
- If the team lost, find something positive — a specific line that was competitive, a player who fought hard
- If it's the final match of the season, reflect briefly on the season as a whole
- If the team won the deciding point, highlight the drama`;

  const prompt = JSON.stringify({
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
  });

  return callGpt(system, prompt);
}
