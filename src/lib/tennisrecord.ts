// ── Types ──────────────────────────────────────────────────────────

export interface TRTeamPlayer {
  name: string;
  /** Full profile path including section param (e.g. /adult/profile.aspx?playername=Kelly%20Lynch&s=2) for disambiguation */
  profilePath?: string;
  ntrp: string;
  seasonRecord: string;
  localSingles: string;
  localDoubles: string;
  localRecord: string;
  rating: number | null;
}

export interface TRPlayerProfile {
  dynamicRating: number | null;
  ratingDate: string | null;
  ntrpType: string | null;
  teams: { name: string; type: string; year: number }[];
  yearlyRecords: { year: number; matches: number; wins: number; losses: number; wpct: number }[];
}

export interface TRPlayerStats {
  record: string | null;
  winPct: number | null;
  currentStreak: string | null;
  longestWinStreak: number | null;
  longestLoseStreak: number | null;
  avgOpponentRating: number | null;
}

export interface TRMatchHistoryEntry {
  date: string;
  leagueType: string;
  team: string;
  court: string;
  partner: string | null;
  opponents: string[];
  result: "W" | "L" | null;
  score: string;
}

export interface TRTeamScouting {
  teamName: string;
  year: number;
  roster: (TRTeamPlayer & {
    profile: TRPlayerProfile | null;
    stats: TRPlayerStats | null;
    matchHistory: TRMatchHistoryEntry[];
  })[];
  fetchedAt: string;
}

// ── Fetch from TennisRecord ────────────────────────────────────────

const TR_BASE = "https://www.tennisrecord.com";

/**
 * USTA schedules often append a club nickname in brackets, e.g. `PLEASANTON 18AM3.0A [DPTG-Doubletons]`.
 * TennisRecord team profile URLs use the base name only (no bracket suffix).
 */
export function canonicalTennisRecordTeamName(scheduleOrTrName: string): string {
  return scheduleOrTrName.replace(/\s*\[[^\]]*\]\s*$/u, "").trim();
}

export async function fetchTennisRecord(path: string): Promise<string | null> {
  const fullUrl = `${TR_BASE}${path}`;
  try {
    const resp = await fetch(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FramersApp/1.0; +https://framers.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!resp.ok) {
      console.error(`[TR] ${resp.status} for ${path}`);
      return null;
    }
    return await resp.text();
  } catch (e) {
    console.error(`[TR] Fetch error for ${path}:`, e);
    return null;
  }
}

// ── Layer 1: Team Profile ──────────────────────────────────────────

function normalizeProfilePath(href: string): string {
  let profilePath = href.trim();
  if (profilePath.startsWith("http")) {
    try {
      const u = new URL(profilePath);
      profilePath = u.pathname + u.search;
    } catch {
      profilePath = "/adult/profile.aspx";
    }
  } else if (!profilePath.startsWith("/")) {
    profilePath = "/" + profilePath;
  }
  return profilePath;
}

/** When TR has no roster yet, the team page is a short "stub" with N/A rows and no player links. */
export function isTennisRecordTeamStubPage(html: string): boolean {
  if (!html) return false;
  if (/profile\.aspx\?playername=/i.test(html)) return false;
  return (
    /class="padding10">N\/A<\/td>/i.test(html) &&
    !/<div class="large">/i.test(html) &&
    !/<div class="small">/i.test(html)
  );
}

/**
 * Human-readable reason when scrapeTeamRoster returns [] (for admin UI / logs).
 */
export function emptyTeamRosterReason(html: string | null, parsedCount: number): string | null {
  if (parsedCount > 0) return null;
  if (!html) return "TennisRecord did not return a page (network, block, or error).";
  if (isTennisRecordTeamStubPage(html)) {
    return "TennisRecord has no roster for this team/year yet (their page shows N/A only). Nothing to import until TR lists players.";
  }
  if (!/profile\.aspx\?playername=/i.test(html)) {
    return "TennisRecord page had no player profile links; the site layout may have changed.";
  }
  return null;
}

function parseTeamRosterSection(section: string): TRTeamPlayer[] {
  const players: TRTeamPlayer[] = [];
  const rowRegex = /<a\s+class="link"\s+href="([^"]*profile\.aspx\?[^"]+)">([^<]+)<\/a>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(section)) !== null) {
    const row = match[0];
    const profilePath = normalizeProfilePath(match[1].trim());
    const name = match[2].trim();

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let td;
    while ((td = tdRegex.exec(row)) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    }

    let ntrp: string;
    let seasonRecord: string;
    let localSingles: string;
    let localDoubles: string;
    let localRecord: string;
    let ratingStr: string;

    if (cells.length >= 8) {
      // Desktop "large": name, location, ntrp, season, localS, localD, localRecord, rating, …
      ntrp = cells[2] || "";
      seasonRecord = cells[3] || "";
      localSingles = cells[4] || "";
      localDoubles = cells[5] || "";
      localRecord = cells[6] || "";
      ratingStr = cells[7] || "";
    } else if (cells.length >= 6) {
      // Mobile "small": name, location, ntrp, season, combined local column, rating, …
      ntrp = cells[2] || "";
      seasonRecord = cells[3] || "";
      localSingles = "";
      localDoubles = "";
      localRecord = cells[4] || "";
      ratingStr = cells[5] || "";
    } else {
      ntrp = cells[2] || "";
      seasonRecord = cells[3] || "";
      localSingles = "";
      localDoubles = "";
      localRecord = "";
      ratingStr = cells[Math.min(5, cells.length - 1)] || "";
    }

    const rating = ratingStr ? parseFloat(ratingStr) : null;

    players.push({
      name,
      profilePath: profilePath || undefined,
      ntrp,
      seasonRecord,
      localSingles,
      localDoubles,
      localRecord,
      rating: rating && !isNaN(rating) ? rating : null,
    });
  }

  return players;
}

export function parseTeamRoster(html: string): TRTeamPlayer[] {
  const largeSection = html.match(
    /<div class="large">([\s\S]*?)(?:<div class="small">|<div class="container-divider0">)/i,
  );
  if (largeSection?.[1]) {
    const fromLarge = parseTeamRosterSection(largeSection[1]);
    if (fromLarge.length > 0) return fromLarge;
  }

  const smallSection = html.match(/<div class="small">\s*<div class="container496">([\s\S]*?<\/table>)/i);
  if (smallSection?.[1]) {
    return parseTeamRosterSection(smallSection[1]);
  }

  return [];
}

export async function scrapeTeamRoster(teamName: string, year: number): Promise<TRTeamPlayer[]> {
  const key = canonicalTennisRecordTeamName(teamName);
  const path = `/adult/teamprofile.aspx?year=${year}&teamname=${encodeURIComponent(key)}`;
  const html = await fetchTennisRecord(path);
  if (!html) return [];
  return parseTeamRoster(html);
}

// ── Layer 2: Player Profile ────────────────────────────────────────

export function parsePlayerProfile(html: string): TRPlayerProfile {
  const result: TRPlayerProfile = {
    dynamicRating: null,
    ratingDate: null,
    ntrpType: null,
    teams: [],
    yearlyRecords: [],
  };

  // Dynamic rating: "Estimated Dynamic Rating" ... <span style="font-weight:bold;">2.7905 </span>
  const dynMatch = html.match(
    /Estimated Dynamic Rating[\s\S]*?<span[^>]*font-weight:\s*bold[^>]*>\s*([\d.]+)\s*<\/span>(?:[\s\S]*?color:#7a7a7a[^>]*>\s*([\d/]+)\s*<\/span>)?/i
  );
  if (dynMatch) {
    result.dynamicRating = parseFloat(dynMatch[1]);
    if (isNaN(result.dynamicRating)) result.dynamicRating = null;
    result.ratingDate = dynMatch[2]?.trim() || null;
  }

  // NTRP type: <span style="font-weight:bold;">3.0 C</span>
  const ntrpMatch = html.match(/<span[^>]*font-weight:\s*bold[^>]*>\s*[\d.]+\s+([A-Z])\s*<\/span>/i);
  if (ntrpMatch) {
    result.ntrpType = ntrpMatch[1];
  }

  // Team memberships: rows with teamprofile.aspx links in the "Recent Team" table
  const teamTableMatch = html.match(/Recent Team[\s\S]*?<\/table>/i);
  if (teamTableMatch) {
    const teamRowRegex = /teamprofile\.aspx\?teamname=([^&"]+)&(?:amp;)?year=(\d+)[^"]*">([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>/gi;
    let tm;
    while ((tm = teamRowRegex.exec(teamTableMatch[0])) !== null) {
      result.teams.push({
        name: tm[3].trim(),
        type: tm[4].trim(),
        year: parseInt(tm[2]),
      });
    }
  }

  // Yearly records: rows in the "All Matches" table
  // Pattern: <td>year_link</td><td>total</td><td>wins</td><td>losses</td><td>wpct</td>
  const yearRowRegex = /matchhistory\.aspx\?year=(\d{4})&[^"]*"[^>]*>(\d{4})<\/a><\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*[\s\S]*?<td[^>]*>([\d.]+)<\/td>/gi;
  let yr;
  while ((yr = yearRowRegex.exec(html)) !== null) {
    result.yearlyRecords.push({
      year: parseInt(yr[2]),
      matches: parseInt(yr[3]),
      wins: parseInt(yr[4]),
      losses: parseInt(yr[5]),
      wpct: parseFloat(yr[6]),
    });
  }

  return result;
}

export async function scrapePlayerProfile(
  playerName: string,
  profilePath?: string,
): Promise<TRPlayerProfile | null> {
  const path = profilePath ?? `/adult/profile.aspx?playername=${encodeURIComponent(playerName)}`;
  const html = await fetchTennisRecord(path);
  if (!html) return null;
  return parsePlayerProfile(html);
}

// ── Layer 3: Player Stats ──────────────────────────────────────────

export function parsePlayerStats(html: string): TRPlayerStats {
  const result: TRPlayerStats = {
    record: null,
    winPct: null,
    currentStreak: null,
    longestWinStreak: null,
    longestLoseStreak: null,
    avgOpponentRating: null,
  };

  function extractStatValue(label: string): string | null {
    // Match: <td ...>Label:</td> ... <td ...>VALUE</td>
    const re = new RegExp(
      label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        ":\\s*<\\/td>\\s*(?:<td[^>]*>)?\\s*(?:<a[^>]*>)?\\s*([^<]+)",
      "i"
    );
    const m = html.match(re);
    return m ? m[1].trim() : null;
  }

  // Record: "4-4 (50.0%)"
  const recordStr = extractStatValue("Record");
  if (recordStr) {
    result.record = recordStr;
    const pctMatch = recordStr.match(/([\d.]+)%/);
    if (pctMatch) result.winPct = parseFloat(pctMatch[1]);
  }

  // Current streak: "W1" or "L3"
  result.currentStreak = extractStatValue("Current W/L Streak");

  // Longest streaks
  const winStreak = extractStatValue("Longest Winning Streak");
  if (winStreak) result.longestWinStreak = parseInt(winStreak);

  const loseStreak = extractStatValue("Longest Losing Streak");
  if (loseStreak) result.longestLoseStreak = parseInt(loseStreak);

  // Average Opponent Rating: "2.9042"
  const avgOpp = extractStatValue("Average Opponent Rating");
  if (avgOpp) {
    result.avgOpponentRating = parseFloat(avgOpp);
    if (isNaN(result.avgOpponentRating)) result.avgOpponentRating = null;
  }

  return result;
}

export async function scrapePlayerStats(
  playerName: string,
  year: number,
  sectionParam?: string,
): Promise<TRPlayerStats | null> {
  let path = `/adult/playerstats.aspx?playername=${encodeURIComponent(playerName)}&year=${year}&mt=0&lt=0&yr=0`;
  if (sectionParam) path += `&s=${sectionParam}`;
  const html = await fetchTennisRecord(path);
  if (!html) return null;
  return parsePlayerStats(html);
}

// ── Layer 4: Match History ─────────────────────────────────────────

export function parseMatchHistory(html: string): TRMatchHistoryEntry[] {
  const entries: TRMatchHistoryEntry[] = [];

  // Find the "large" table section (desktop layout)
  const largeMatch = html.match(/<div class="large">([\s\S]*?)(?:<div class="small">|<div class="container-divider0">)/);
  if (!largeMatch) return entries;
  const section = largeMatch[1];

  // Split into rows
  const rowRegex = /<tr style='border-bottom:1px solid #ddd;'>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(section)) !== null) {
    const row = rowMatch[1];

    // Date: first <td> with date pattern
    const dateMatch = row.match(/<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>/);
    const date = dateMatch ? dateMatch[1] : "";

    // League type: link text like "Adult 40+<br>3.0" or "Mixed 18+<br>6.0"
    const leagueMatch = row.match(/league\.aspx[^>]*>([^<]*(?:<br>[^<]*)?)<\/a>/i);
    const leagueType = leagueMatch ? leagueMatch[1].replace(/<br\s*\/?>/gi, " ").trim() : "";

    // Team: teamprofile.aspx link
    const teamMatch = row.match(/teamprofile\.aspx[^>]*>([^<]*)/i);
    const team = teamMatch ? teamMatch[1].trim() : "";

    // Court position: <td ...>D1</td> or <td ...>S1</td>
    const courtMatch = row.match(/<td[^>]*>\s*([DS]\d)\s*<\/td>/i);
    const court = courtMatch ? courtMatch[1] : "";

    // Partner: first matchhistory.aspx link in the Partner cell
    // The partner cell comes before the border-right opponent cell
    const partnerCellMatch = row.match(
      /<td[^>]*vertical-align[^>]*>\s*(?:<a[^>]*matchhistory\.aspx\?playername=([^&"]+)[^>]*>([^<]+)<\/a>)?[\s\S]*?<\/td>\s*(?:<td[^>]*border-right)/i
    );
    const partner = partnerCellMatch?.[2]?.trim() || null;

    // Opponents: matchhistory.aspx links in the border-right cell
    const oppCellMatch = row.match(/<td[^>]*border-right:1px solid #ddd[^>]*>([\s\S]*?)<\/td>/i);
    const opponents: string[] = [];
    if (oppCellMatch) {
      const oppLinkRegex = /matchhistory\.aspx\?playername=([^&"]+)[^>]*>([^<]+)<\/a>/gi;
      let oppLink;
      while ((oppLink = oppLinkRegex.exec(oppCellMatch[1])) !== null) {
        opponents.push(oppLink[2].trim());
      }
    }

    // W/L result
    const resultMatch = row.match(/<td[^>]*>\s*([WL])\s*<\/td>/i);
    const result = resultMatch ? (resultMatch[1].toUpperCase() as "W" | "L") : null;

    // Score: matchresults.aspx link content (set scores separated by <br>)
    const scoreMatch = row.match(/matchresults\.aspx[^>]*>([\s\S]*?)<\/a>/i);
    const score = scoreMatch ? scoreMatch[1].replace(/<br\s*\/?>/gi, ", ").trim() : "";

    if (date) {
      entries.push({ date, leagueType, team, court, partner, opponents, result, score });
    }
  }

  return entries;
}

export async function scrapeMatchHistory(
  playerName: string,
  year: number | "Recent",
  sectionParam?: string,
): Promise<TRMatchHistoryEntry[]> {
  let path = `/adult/matchhistory.aspx?year=${year}&playername=${encodeURIComponent(playerName)}&mt=0&lt=0&yr=0`;
  if (sectionParam) path += `&s=${sectionParam}`;
  const html = await fetchTennisRecord(path);
  if (!html) return [];
  return parseMatchHistory(html);
}

// ── Orchestration ──────────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

export interface ScoutProgress {
  phase: string;
  current: number;
  total: number;
  player?: string;
  error?: string;
}

export async function deepScoutTeam(
  teamName: string,
  year: number,
  onProgress?: (p: ScoutProgress) => void,
): Promise<TRTeamScouting> {
  const canonical = canonicalTennisRecordTeamName(teamName);
  onProgress?.({ phase: "roster", current: 0, total: 1 });
  const roster = await scrapeTeamRoster(canonical, year);
  onProgress?.({ phase: "roster", current: 1, total: 1 });

  if (roster.length === 0) {
    return { teamName: canonical, year, roster: [], fetchedAt: new Date().toISOString() };
  }

  const fullRoster: TRTeamScouting["roster"] = roster.map((p) => ({
    ...p,
    profile: null,
    stats: null,
    matchHistory: [],
  }));

  const total = roster.length;
  let completed = 0;
  let consecutiveErrors = 0;

  const tasks = roster.map((player, i) => async () => {
    if (consecutiveErrors >= 5) {
      onProgress?.({ phase: "deep", current: completed, total, player: player.name, error: "Aborted: too many consecutive errors" });
      return;
    }

    onProgress?.({ phase: "deep", current: completed, total, player: player.name });

    const sectionParam = player.profilePath?.match(/[?&]s=(\d+)/)?.[1];
    const [profile, stats, history] = await Promise.all([
      scrapePlayerProfile(player.name, player.profilePath).catch((e) => {
        console.error(`[TR] Profile error for ${player.name}:`, e);
        return null;
      }),
      scrapePlayerStats(player.name, year, sectionParam).catch((e) => {
        console.error(`[TR] Stats error for ${player.name}:`, e);
        return null;
      }),
      scrapeMatchHistory(player.name, year, sectionParam).catch((e) => {
        console.error(`[TR] History error for ${player.name}:`, e);
        return [] as TRMatchHistoryEntry[];
      }),
    ]);

    if (!profile && !stats && history.length === 0) {
      consecutiveErrors++;
    } else {
      consecutiveErrors = 0;
    }

    fullRoster[i] = { ...fullRoster[i], profile, stats, matchHistory: history };
    completed++;
    onProgress?.({ phase: "deep", current: completed, total, player: player.name });
  });

  // 3 concurrent fetches (each task does 3 parallel sub-fetches internally,
  // so effective concurrency to tennisrecord is up to 9 -- but Promise.all
  // inside each task keeps them together)
  await runWithConcurrency(tasks, 3);

  return {
    teamName: canonical,
    year,
    roster: fullRoster,
    fetchedAt: new Date().toISOString(),
  };
}

// Quick scout: team page only, for fast fallback in cron
export async function quickScoutTeam(
  teamName: string,
  year: number,
): Promise<TRTeamPlayer[]> {
  return scrapeTeamRoster(teamName, year);
}

// ── Head-to-Head Detection ─────────────────────────────────────────

export interface HeadToHeadMatch {
  ourPlayer: string;
  opponent: string;
  date: string;
  court: string;
  result: "W" | "L" | null;
  score: string;
  partner: string | null;
}

export function findHeadToHead(
  ourMatchHistories: Map<string, TRMatchHistoryEntry[]>,
  opponentNames: Set<string>,
): HeadToHeadMatch[] {
  const matches: HeadToHeadMatch[] = [];
  const oppNamesLower = new Set([...opponentNames].map((n) => n.toLowerCase()));

  for (const [ourPlayer, history] of ourMatchHistories) {
    for (const entry of history) {
      for (const opp of entry.opponents) {
        if (oppNamesLower.has(opp.toLowerCase())) {
          matches.push({
            ourPlayer,
            opponent: opp,
            date: entry.date,
            court: entry.court,
            result: entry.result,
            score: entry.score,
            partner: entry.partner,
          });
        }
      }
    }
  }

  matches.sort((a, b) => b.date.localeCompare(a.date));
  return matches;
}

// ── Match Predictions ──────────────────────────────────────────────

export interface LinePrediction {
  position: string;
  ourPlayer: string;
  ourRating: number;
  oppPlayer: string;
  oppRating: number;
  winProbability: number;
}

export interface MatchPrediction {
  linePredictions: LinePrediction[];
  expectedScore: number;
  predictedResult: string;
}

export function predictMatchOutcome(
  ourLineup: { position: string; playerName: string; trRating: number | null }[],
  opponentRoster: { name: string; trRating: number | null; trDynamicRating: number | null }[],
): MatchPrediction {
  // Sort opponents by best available rating descending
  const sortedOpponents = [...opponentRoster]
    .map((o) => ({ name: o.name, rating: o.trDynamicRating ?? o.trRating ?? 2.5 }))
    .sort((a, b) => b.rating - a.rating);

  // Typical lineup ordering: D1, D2, D3, S1, S2 (strongest first)
  const lineOrder = ["D1", "D2", "D3", "S1", "S2"];

  const linePredictions: LinePrediction[] = [];
  let expectedScore = 0;

  for (let i = 0; i < lineOrder.length; i++) {
    const pos = lineOrder[i];
    const ourLine = ourLineup.find((l) => l.position.startsWith(pos));
    const ourRating = ourLine?.trRating ?? 2.75;
    const ourName = ourLine?.playerName ?? "TBD";

    // Assume opponent puts their i-th strongest player on this line
    const oppPlayer = sortedOpponents[i];
    const oppRating = oppPlayer?.rating ?? 2.75;
    const oppName = oppPlayer?.name ?? "Unknown";

    // Win probability: scale 0.5 maps TR range (2.0-4.0) to useful spreads
    // A 0.3 TR difference ≈ 70% win probability for the higher-rated player
    const winProb = 1 / (1 + Math.pow(10, (oppRating - ourRating) / 0.5));

    // D1 is worth 2 points in 40+ leagues
    const pointValue = pos === "D1" ? 2 : 1;
    expectedScore += winProb * pointValue;

    linePredictions.push({
      position: pos,
      ourPlayer: ourName,
      ourRating,
      oppPlayer: oppName,
      oppRating,
      winProbability: Math.round(winProb * 100) / 100,
    });
  }

  const totalPoints = 6; // D1=2 + D2=1 + D3=1 + S1=1 + S2=1
  const roundedExpected = Math.round(expectedScore * 10) / 10;
  const predictedWins = Math.round(expectedScore);
  const predictedLosses = totalPoints - predictedWins;

  return {
    linePredictions,
    expectedScore: roundedExpected,
    predictedResult: `${predictedWins}-${predictedLosses}`,
  };
}
