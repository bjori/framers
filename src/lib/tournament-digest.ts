import { getCloudflareContext } from "@opennextjs/cloudflare";
import { emailTemplate } from "@/lib/email";

interface TournamentMatch {
  id: string;
  week: number;
  participant1_id: string;
  participant2_id: string;
  winner_participant_id: string | null;
  score1_sets: string | null;
  score2_sets: string | null;
  status: string;
  updated_at: string | null;
  p1_name: string;
  p2_name: string;
  p1_player_id: string;
  p2_player_id: string;
  scheduled_date: string | null;
}

interface Standing {
  participant_id: string;
  player_id: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  elo: number;
}

interface EloChange {
  player_id: string;
  name: string;
  delta: number;
  old_elo: number;
  new_elo: number;
}

interface WeekResult {
  p1Name: string;
  p2Name: string;
  winnerName: string;
  score: string;
  p1EloDelta: number;
  p2EloDelta: number;
  isUpset: boolean;
}

interface UpcomingMatch {
  p1Name: string;
  p2Name: string;
  p1Rank: number;
  p2Rank: number;
  p1Record: string;
  p2Record: string;
  scheduledDate: string | null;
  quip: string | null;
  winProbability: number | null;
}

export interface DigestData {
  tournamentName: string;
  tournamentSlug: string;
  weekLabel: string;
  currentWeek: number;
  totalWeeks: number;
  results: WeekResult[];
  standings: Standing[];
  eloChanges: EloChange[];
  biggestUpset: WeekResult | null;
  upcomingMatches: UpcomingMatch[];
  /** Every non-bye match completed */
  seasonComplete: boolean;
  /** Top finisher with zero losses (round-robin perfect season) */
  undefeatedChampion: { name: string; wins: number; losses: number } | null;
  /** Everyone with 0 wins (usually one person in a full round robin) */
  winlessPlayers: { name: string; wins: number; losses: number }[];
  digestKind: "weekly" | "season_finale";
  emailSubject: string;
}

function parseScore(s: string | null): number[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function formatScore(s1: string | null, s2: string | null, winnerId: string | null, p1Id: string): string {
  const sets1 = parseScore(s1);
  const sets2 = parseScore(s2);
  if (sets1.length === 0) return "";
  const isP1Winner = winnerId === p1Id;
  return sets1.map((g, i) => {
    const a = isP1Winner ? g : (sets2[i] ?? 0);
    const b = isP1Winner ? (sets2[i] ?? 0) : g;
    return `${a}-${b}`;
  }).join(", ");
}

function computeStandings(
  matches: TournamentMatch[],
  participants: { id: string; player_id: string; name: string; singles_elo: number }[],
): Standing[] {
  const map = new Map<string, Standing>();
  for (const p of participants) {
    map.set(p.id, {
      participant_id: p.id,
      player_id: p.player_id,
      name: p.name,
      elo: p.singles_elo,
      matches: 0, wins: 0, losses: 0,
      setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_participant_id) continue;
    const s1 = parseScore(m.score1_sets);
    const s2 = parseScore(m.score2_sets);
    const p1 = map.get(m.participant1_id);
    const p2 = map.get(m.participant2_id);
    if (!p1 || !p2) continue;

    p1.matches++; p2.matches++;
    if (m.winner_participant_id === m.participant1_id) { p1.wins++; p2.losses++; }
    else { p2.wins++; p1.losses++; }

    let p1SetsWon = 0, p2SetsWon = 0;
    for (let i = 0; i < s1.length; i++) {
      const g1 = s1[i] ?? 0, g2 = s2[i] ?? 0;
      p1.gamesWon += g1; p1.gamesLost += g2;
      p2.gamesWon += g2; p2.gamesLost += g1;
      if (g1 > g2) p1SetsWon++; else if (g2 > g1) p2SetsWon++;
    }
    p1.setsWon += p1SetsWon; p1.setsLost += p2SetsWon;
    p2.setsWon += p2SetsWon; p2.setsLost += p1SetsWon;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.setsWon - b.setsLost !== a.setsWon - a.setsLost)
      return (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost);
    return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
  });
}

export async function gatherDigestData(db: D1Database, tournamentSlug: string): Promise<DigestData | null> {
  const tournament = await db.prepare(
    "SELECT id, name, slug FROM tournaments WHERE slug = ? AND status = 'active'"
  ).bind(tournamentSlug).first<{ id: string; name: string; slug: string }>();
  if (!tournament) return null;

  const participants = (await db.prepare(
    `SELECT tp.id, tp.player_id, p.name, p.singles_elo
     FROM tournament_participants tp JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = ?`
  ).bind(tournament.id).all<{ id: string; player_id: string; name: string; singles_elo: number }>()).results;

  const allMatches = (await db.prepare(
    `SELECT tm.id, tm.week, tm.participant1_id, tm.participant2_id,
            tm.winner_participant_id, tm.score1_sets, tm.score2_sets,
            tm.status, tm.updated_at, tm.scheduled_date,
            tm.pre_match_quip, tm.win_probability,
            p1.name as p1_name, p2.name as p2_name,
            tp1.player_id as p1_player_id, tp2.player_id as p2_player_id
     FROM tournament_matches tm
     LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
     LEFT JOIN players p1 ON p1.id = tp1.player_id
     LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
     LEFT JOIN players p2 ON p2.id = tp2.player_id
     WHERE tm.tournament_id = ? AND tm.bye = 0
     ORDER BY tm.week, tm.match_number`
  ).bind(tournament.id).all<TournamentMatch & { pre_match_quip: string | null; win_probability: number | null }>()).results;

  const totalWeeks = Math.max(...allMatches.map((m) => m.week), 0);
  const completedMatches = allMatches.filter((m) => m.status === "completed");
  const seasonComplete =
    allMatches.length > 0 && allMatches.every((m) => m.status === "completed");

  // "This week" = matches completed in the last 7 days (cron sends Sunday)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  let thisWeekResults = allMatches.filter(
    (m) => m.status === "completed" && m.updated_at && m.updated_at >= weekAgo
  );

  if (thisWeekResults.length === 0 && seasonComplete) {
    const maxWeek = Math.max(...completedMatches.map((m) => m.week), 0);
    thisWeekResults = completedMatches.filter((m) => m.week === maxWeek);
  }
  if (thisWeekResults.length === 0 && seasonComplete && completedMatches.length > 0) {
    thisWeekResults = completedMatches;
  }

  if (thisWeekResults.length === 0) return null;

  // Figure out current week number from the latest completed matches
  const currentWeek = seasonComplete
    ? totalWeeks
    : Math.max(...thisWeekResults.map((m) => m.week), 0);

  const standings = computeStandings(allMatches, participants);
  const standingsByParticipant = new Map(standings.map((s) => [s.participant_id, s]));
  const standingsByPlayerId = new Map(standings.map((s) => [s.player_id, s]));

  // ELO changes this week
  const eloChanges = (await db.prepare(
    `SELECT eh.player_id, p.name, eh.delta, eh.old_elo, eh.new_elo
     FROM elo_history eh JOIN players p ON p.id = eh.player_id
     WHERE eh.type = 'singles' AND eh.source = 'tournament' AND eh.created_at >= ?
     ORDER BY ABS(eh.delta) DESC`
  ).bind(weekAgo).all<EloChange>()).results;

  // Build results with upset detection
  const results: WeekResult[] = thisWeekResults.map((m) => {
    const winnerIsP1 = m.winner_participant_id === m.participant1_id;
    const winnerName = winnerIsP1 ? m.p1_name : m.p2_name;
    const score = formatScore(m.score1_sets, m.score2_sets, m.winner_participant_id, m.participant1_id);

    const winnerStanding = standingsByParticipant.get(m.winner_participant_id!);
    const loserParticipantId = winnerIsP1 ? m.participant2_id : m.participant1_id;
    const loserStanding = standingsByParticipant.get(loserParticipantId);

    const winnerElo = winnerStanding?.elo ?? 1500;
    const loserElo = loserStanding?.elo ?? 1500;
    const isUpset = loserElo > winnerElo + 50;

    const p1Change = eloChanges.find(
      (e) => e.player_id === m.p1_player_id
        && Math.abs(new Date(m.updated_at!).getTime() - Date.now()) < 7 * 86400000
    );
    const p2Change = eloChanges.find(
      (e) => e.player_id === m.p2_player_id
        && Math.abs(new Date(m.updated_at!).getTime() - Date.now()) < 7 * 86400000
    );

    return {
      p1Name: m.p1_name,
      p2Name: m.p2_name,
      winnerName,
      score,
      p1EloDelta: p1Change?.delta ?? 0,
      p2EloDelta: p2Change?.delta ?? 0,
      isUpset,
    };
  });

  const biggestUpset = results.filter((r) => r.isUpset)
    .sort((a, b) => Math.max(Math.abs(b.p1EloDelta), Math.abs(b.p2EloDelta)) - Math.max(Math.abs(a.p1EloDelta), Math.abs(a.p2EloDelta)))[0] ?? null;

  // Upcoming matches: next week's scheduled matches
  const upcomingMatches: UpcomingMatch[] = allMatches
    .filter((m) => m.status === "scheduled" && m.week === currentWeek + 1 && !seasonComplete)
    .map((m) => {
      const p1Standing = standingsByParticipant.get(m.participant1_id);
      const p2Standing = standingsByParticipant.get(m.participant2_id);
      const p1Rank = standings.findIndex((s) => s.participant_id === m.participant1_id) + 1;
      const p2Rank = standings.findIndex((s) => s.participant_id === m.participant2_id) + 1;
      return {
        p1Name: m.p1_name,
        p2Name: m.p2_name,
        p1Rank,
        p2Rank,
        p1Record: p1Standing ? `${p1Standing.wins}-${p1Standing.losses}` : "0-0",
        p2Record: p2Standing ? `${p2Standing.wins}-${p2Standing.losses}` : "0-0",
        scheduledDate: m.scheduled_date,
        quip: m.pre_match_quip ?? null,
        winProbability: m.win_probability ?? null,
      };
    });

  const top = standings[0];
  const undefeatedChampion =
    top && top.losses === 0 && top.wins > 0
      ? { name: top.name, wins: top.wins, losses: top.losses }
      : null;

  const winlessPlayers = standings.filter((s) => s.wins === 0 && s.matches > 0);

  const digestKind: DigestData["digestKind"] = seasonComplete ? "season_finale" : "weekly";
  const weekLabel = seasonComplete
    ? `Season complete — ${totalWeeks} weeks of battle`
    : `Week ${currentWeek} of ${totalWeeks}`;

  const emailSubject = seasonComplete
    ? `${tournament.name} — Season finale: champion crowned!`
    : `${tournament.name} — ${weekLabel} recap`;

  return {
    tournamentName: tournament.name,
    tournamentSlug: tournament.slug,
    weekLabel,
    currentWeek,
    totalWeeks,
    results,
    standings,
    eloChanges,
    biggestUpset,
    upcomingMatches,
    seasonComplete,
    undefeatedChampion,
    winlessPlayers,
    digestKind,
    emailSubject,
  };
}

export async function generateDigestNarrative(data: DigestData): Promise<string> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return "";

    const standingsPayload = data.standings.map((s, i) => ({
      rank: i + 1,
      name: s.name,
      record: `${s.wins}-${s.losses}`,
      sets: `${s.setsWon}-${s.setsLost}`,
      elo: s.elo,
    }));

    const resultsPayload = data.results.map((r) => ({
      winner: r.winnerName,
      loser: r.p1Name === r.winnerName ? r.p2Name : r.p1Name,
      score: r.score,
      isUpset: r.isUpset,
      winnerEloDelta: r.p1Name === r.winnerName ? r.p1EloDelta : r.p2EloDelta,
    }));

    if (data.digestKind === "season_finale") {
      const prompt = {
        season: "Greenbrook Singles World Championships — full season round robin finished",
        standings: standingsPayload,
        finalWeekResults: resultsPayload,
        undefeatedChampion: data.undefeatedChampion,
        winlessPlayers: data.winlessPlayers.map((w) => w.name),
        biggestUpset: data.biggestUpset
          ? {
              winner: data.biggestUpset.winnerName,
              loser: data.biggestUpset.p1Name === data.biggestUpset.winnerName ? data.biggestUpset.p2Name : data.biggestUpset.p1Name,
              score: data.biggestUpset.score,
            }
          : null,
        totalWeeks: data.totalWeeks,
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.92,
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content: `You are the lead voice of the Greenbrook Singles World Championships — think ESPN Finals night meets neighborhood block party. The season is OVER. This is the season-ending wrap-up email to everyone who played.

Your tone must be electric, warm, and genuinely celebratory. First names only for players. No emojis. No mockery.

Required structure — use these exact H3 headers in order:

### And the champion is…
Open with MAXIMUM hype for the undefeated champion (if undefeatedChampion is provided: zero losses, perfect season). If for some reason there is no undefeated player, still celebrate the #1 finisher in standings with equal enthusiasm. This section should be the longest and most excited — banners, legacy, perfection, neighborhood legend energy.

### Season standouts
Call out several other great stories from the standings: strong records, comeback seasons, tight races, memorable upsets, or anyone who made the league more fun. Spread the love across multiple players.

### Hats off to our battlers
The player(s) listed in winlessPlayers went winless through the full season — congratulate them sincerely for showing up every week, taking the tough matches, and keeping the round robin honest. Frame it as grit and heart, never shame. If winlessPlayers is empty, skip this section entirely (do not include the header).

### That's a wrap
One short closing paragraph: gratitude for the season, the courts, and each other.

Keep it under 450 words. HTML only: <h3>, <p>, <strong> tags.`,
            },
            { role: "user", content: JSON.stringify(prompt) },
          ],
        }),
      });

      if (!res.ok) {
        console.error("[DIGEST] GPT call failed:", await res.text());
        return "";
      }
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return json.choices[0]?.message?.content ?? "";
    }

    const prompt = {
      standings: data.standings.slice(0, 10).map((s, i) => ({
        rank: i + 1, name: s.name, record: `${s.wins}-${s.losses}`,
        sets: `${s.setsWon}-${s.setsLost}`, elo: s.elo,
      })),
      thisWeekResults: resultsPayload,
      nextWeekMatches: data.upcomingMatches.map((m) => ({
        p1: `${m.p1Name} (#${m.p1Rank}, ${m.p1Record})`,
        p2: `${m.p2Name} (#${m.p2Rank}, ${m.p2Record})`,
        odds: m.winProbability != null ? `${m.p1Name.split(" ")[0]} ${Math.round(m.winProbability * 100)}%` : undefined,
        quip: m.quip ?? undefined,
      })),
      weekLabel: data.weekLabel,
      isLastWeeks: data.currentWeek >= data.totalWeeks - 1,
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: `You are a witty sports journalist covering the Greenbrook Singles World Championships, an amateur tennis round-robin tournament in a San Ramon, CA neighborhood. Write an engaging weekly recap email. Use player first names only. Be fun, occasionally cheeky, but respectful. No emojis.

Write exactly three sections with these H3 headers:
### Week in Review
(2-3 paragraphs covering results, upsets, notable performances, streaks)

### Player to Watch
(1 short paragraph about the biggest mover or most interesting storyline)

### Next Week Preview
(1-2 paragraphs about upcoming key matchups and what's at stake. If it's the final weeks, build excitement about the title race.)

Keep total output under 300 words. Write in HTML using <h3>, <p>, <strong> tags only.`,
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[DIGEST] GPT call failed:", await res.text());
      return "";
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content ?? "";
  } catch (e) {
    console.error("[DIGEST] GPT error:", e);
    return "";
  }
}

export function buildDigestEmailHtml(data: DigestData, narrative: string): string {
  // Standings table
  const standingsRows = data.standings.map((s, i) => {
    const rank = i + 1;
    const bgColor = rank <= 3 ? "#f0fdf4" : rank === data.standings.length ? "#fef2f2" : "#ffffff";
    return `<tr style="background: ${bgColor};">
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b;">${rank}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${s.name}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #166534; font-weight: 600;">${s.wins}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #991b1b;">${s.losses}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #475569;">${s.setsWon}-${s.setsLost}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #475569;">${s.elo}</td>
    </tr>`;
  }).join("");

  const standingsTitle = data.digestKind === "season_finale" ? "Final standings" : "Standings";

  const standingsHtml = `
    <h3 style="font-size: 15px; color: #0c4a6e; margin: 24px 0 8px 0;">${standingsTitle}</h3>
    <table role="presentation" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #f1f5f9;">
        <th style="padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">#</th>
        <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Player</th>
        <th style="padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">W</th>
        <th style="padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">L</th>
        <th style="padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Sets</th>
        <th style="padding: 8px 10px; text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">ELO</th>
      </tr>
      ${standingsRows}
    </table>`;

  // This week's results
  const resultsRows = data.results.map((r) => {
    const loser = r.p1Name === r.winnerName ? r.p2Name : r.p1Name;
    const upsetBadge = r.isUpset ? ' <span style="background: #fef3c7; color: #92400e; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">UPSET</span>' : "";
    return `<tr>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #166534;">${r.winnerName}${upsetBadge}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #991b1b;">${loser}</td>
      <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #475569; font-family: monospace;">${r.score}</td>
    </tr>`;
  }).join("");

  const resultsSectionTitle = data.digestKind === "season_finale" ? "Final matches" : "This Week's Results";

  const resultsHtml = data.results.length > 0 ? `
    <h3 style="font-size: 15px; color: #0c4a6e; margin: 24px 0 8px 0;">${resultsSectionTitle}</h3>
    <table role="presentation" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #f1f5f9;">
        <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Winner</th>
        <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Defeated</th>
        <th style="padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Score</th>
      </tr>
      ${resultsRows}
    </table>` : "";

  // Upcoming matches
  const upcomingRows = data.upcomingMatches.map((m) => {
    const probHtml = m.winProbability != null
      ? (() => {
          const p1Pct = Math.round(m.winProbability! * 100);
          const p2Pct = 100 - p1Pct;
          return `<div style="margin-top: 4px;">
            <div style="display: flex; font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
              <span style="flex: 1;">${p1Pct}%</span>
              <span style="text-align: right;">${p2Pct}%</span>
            </div>
            <div style="height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
              <div style="height: 100%; width: ${p1Pct}%; background: #0ea5e9; border-radius: 2px;"></div>
            </div>
          </div>`;
        })()
      : "";
    const quipHtml = m.quip
      ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b; font-style: italic;">${m.quip}</p>`
      : "";
    return `<tr>
      <td colspan="3" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #1e293b; font-weight: 600;">${m.p1Name}</span>
          <span style="color: #94a3b8; font-size: 11px;">(#${m.p1Rank}, ${m.p1Record})</span>
          <span style="color: #94a3b8; font-weight: 700; margin: 0 4px;">vs</span>
          <span style="color: #1e293b; font-weight: 600;">${m.p2Name}</span>
          <span style="color: #94a3b8; font-size: 11px;">(#${m.p2Rank}, ${m.p2Record})</span>
        </div>
        ${probHtml}
        ${quipHtml}
      </td>
    </tr>`;
  }).join("");

  const upcomingHtml = data.upcomingMatches.length > 0 ? `
    <h3 style="font-size: 15px; color: #0c4a6e; margin: 24px 0 8px 0;">Next Week's Matches</h3>
    <table role="presentation" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0; border-collapse: collapse; font-size: 13px;">
      ${upcomingRows}
    </table>` : "";

  const finaleHero =
    data.digestKind === "season_finale" && data.undefeatedChampion
      ? `<div style="margin: 0 0 20px 0; padding: 18px 20px; background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%); border-radius: 12px; text-align: center;">
           <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #bae6fd;">Undefeated champion</p>
           <p style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; line-height: 1.2;">${data.undefeatedChampion.name.split(" ")[0]}</p>
           <p style="margin: 8px 0 0 0; font-size: 14px; font-weight: 600; color: #e0f2fe;">${data.undefeatedChampion.wins}-${data.undefeatedChampion.losses} · perfect season</p>
         </div>`
      : data.digestKind === "season_finale"
        ? `<div style="margin: 0 0 20px 0; padding: 16px 18px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; text-align: center;">
             <p style="margin: 0; font-size: 15px; font-weight: 700; color: #0c4a6e;">Season complete — thanks for an incredible run</p>
           </div>`
        : "";

  const subline =
    data.digestKind === "season_finale"
      ? "Season finale — full round robin in the books"
      : `${data.results.length} match${data.results.length !== 1 ? "es" : ""} completed this week`;

  const content = `
    ${finaleHero}
    <h2 style="margin: 0 0 4px 0; font-size: 20px; color: #0c4a6e;">${data.weekLabel}</h2>
    <p style="margin: 0 0 20px 0; font-size: 13px; color: #94a3b8;">${subline}</p>
    ${narrative ? `<div style="margin: 0 0 8px 0; font-size: 14px; line-height: 1.7; color: #334155;">${narrative}</div><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">` : ""}
    ${resultsHtml}
    ${standingsHtml}
    ${upcomingHtml}`;

  return emailTemplate(content, {
    heading: data.tournamentName,
    ctaUrl: `https://framers.app/tournament/${data.tournamentSlug}`,
    ctaLabel: data.digestKind === "season_finale" ? "Relive the season" : "View Full Standings",
  });
}
