const USTA_BASE = "https://leagues.ustanorcal.com";

const PLAYER_NAME_MAP: Record<string, string> = {
  "allen,bradley": "624ef626-b13a-47c9-b23b-6fa96c237f47",
  "garrahan,juan": "a1b2c3d4-1111-4000-8000-000000000001",
  "gilkey,travis": "269a7039-5e49-47b3-a621-d4c40f3f40b5",
  "hocker,guy": "a1b2c3d4-1111-4000-8000-000000000002",
  "lopez,daniel": "5c591f7a-9f54-4e86-a507-787d2770f028",
  "lynch,kelly": "a1b2c3d4-1111-4000-8000-000000000003",
  "magnusson,hannes": "8dbc87ab-f415-40ee-9fed-e7857445f998",
  "martinez,kirk": "acd5a9ec-d224-466a-a6d1-7b9b28aa961b",
  "mccabe,matthew": "5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa",
  "modi,shimon": "e200b62b-e557-47ba-98e8-1dca23d23e0e",
  "moran,jeff": "a1b2c3d4-1111-4000-8000-000000000004",
  "moss,joe": "92e1a868-573c-487e-93c6-3f84488a222c",
  "pereida-rice,tristan": "eb9d8bcb-ad69-43fc-87c2-d7024060185a",
  "shah,bhaven": "a1b2c3d4-1111-4000-8000-000000000005",
  "turner,jeff": "a1b2c3d4-1111-4000-8000-000000000006",
  "vemuri,sri": "bbbf95a3-2773-4035-8b20-99354ab33a0d",
  "zdarko,joel": "ad74e6ea-ffcc-419f-8c15-3dcdf366d490",
  "alarcon,jun": "a1b2c3d4-3333-4000-8000-000000000002",
  "mazzoni,stefano": "a1b2c3d4-3333-4000-8000-000000000001",
};

export function resolvePlayer(ustaName: string): string | null {
  const clean = ustaName.replace(/\s+/g, "").toLowerCase().trim();
  if (PLAYER_NAME_MAP[clean]) return PLAYER_NAME_MAP[clean];
  const lastName = clean.split(",")[0];
  for (const [key, id] of Object.entries(PLAYER_NAME_MAP)) {
    if (key.startsWith(lastName + ",")) return id;
  }
  return null;
}

interface ParsedLine {
  position: string;
  p1: string | null;
  p2: string | null;
  score: string;
  won: boolean;
  isDefault: boolean;
}

function parseScore(score: string, won: boolean): { our: string; opp: string } {
  const sets = score.split(",").map((s: string) => s.trim());
  const ourParts: string[] = [];
  const oppParts: string[] = [];
  for (const set of sets) {
    const nums = set.split("-").map((n: string) => n.trim());
    if (nums.length === 2) {
      if (won) { ourParts.push(nums[0]); oppParts.push(nums[1]); }
      else { ourParts.push(nums[1]); oppParts.push(nums[0]); }
    }
  }
  return { our: ourParts.join(","), opp: oppParts.join(",") };
}

function normalizeUstaName(ustaName: string): string {
  const parts = ustaName.split(",").map((s: string) => s.trim().toLowerCase());
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return ustaName.toLowerCase().trim();
}

interface ParsedScheduleMatch {
  roundNumber: number;
  matchDate: string;
  opponentTeam: string;
  isHome: boolean;
}

export interface SyncResult {
  teamSlug: string;
  scorecards: number;
  updated: number;
  rosterSynced: number;
  rosterNames: string[];
  scheduleCreated: number;
  scheduleUpdated: number;
}

export async function syncUstaTeam(db: D1Database, teamSlug: string): Promise<SyncResult> {
  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?")
    .bind(teamSlug).first<{ id: string; usta_team_id: string }>();

  if (!team?.usta_team_id) {
    return { teamSlug, scorecards: 0, updated: 0, rosterSynced: 0, rosterNames: [], scheduleCreated: 0, scheduleUpdated: 0 };
  }

  const teamUrl = `${USTA_BASE}/teaminfo.asp?id=${team.usta_team_id}`;
  const teamResp = await fetch(teamUrl);
  const teamHtml = await teamResp.text();

  // Extract match time/notes
  const schedRowRegex = /(\d{2})\/(\d{2})\/(\d{2})<\/a>.*?<td[^>]*>(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)<\/td>\s*<td>([^<]*)/gi;
  let schedMatch;
  const timeUpdates: { date: string; rawTime: string }[] = [];
  while ((schedMatch = schedRowRegex.exec(teamHtml)) !== null) {
    const d = `20${schedMatch[3]}-${schedMatch[1]}-${schedMatch[2]}`;
    const raw = schedMatch[4].replace(/&nbsp;/g, " ").trim();
    if (raw) timeUpdates.push({ date: d, rawTime: raw });
  }
  const schedRowRegex2 = /&nbsp;(\d{2})\/(\d{2})\/(\d{2})<\/td>\s*<td[^>]*>(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)<\/td>\s*<td>([^<]*)/gi;
  while ((schedMatch = schedRowRegex2.exec(teamHtml)) !== null) {
    const d = `20${schedMatch[3]}-${schedMatch[1]}-${schedMatch[2]}`;
    const raw = schedMatch[4].replace(/&nbsp;/g, " ").trim();
    if (raw) timeUpdates.push({ date: d, rawTime: raw });
  }

  for (const tu of timeUpdates) {
    const timeMatch = tu.rawTime.match(/(\d{1,2}:\d{2})\s*(AM|PM)/i);
    let matchTime: string | null = null;
    if (timeMatch) {
      const [, t, period] = timeMatch;
      const [hh, mm] = t.split(":").map(Number);
      const h24 = period.toUpperCase() === "PM" && hh < 12 ? hh + 12 : period.toUpperCase() === "AM" && hh === 12 ? 0 : hh;
      matchTime = `${String(h24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    if (matchTime) {
      await db.prepare("UPDATE league_matches SET match_time = ?, notes = ? WHERE team_id = ? AND match_date = ?")
        .bind(matchTime, tu.rawTime, team.id, tu.date).run();
    }
  }

  // Parse schedule: extract matches with opponents and home/away
  const scheduleMatches: ParsedScheduleMatch[] = [];
  const schedSection = teamHtml.indexOf("Team Schedule");
  const rosterStart = teamHtml.indexOf("Team Roster");
  if (schedSection > -1) {
    const schedHtml = teamHtml.substring(schedSection, rosterStart > -1 ? rosterStart : undefined);
    // Each match spans multiple lines:
    //   &nbsp;ROUND&nbsp; ... MM/DD/YY ... opponent link ... Home|Away
    const schedRegex = /&nbsp;(\d+)&nbsp;[\s\S]*?(\d{2})\/(\d{2})\/(\d{2})<\/td>[\s\S]*?(?:Teaminfo|teaminfo)\.asp\?id=\d+>([^<]+)<\/a><\/td>\s*<td[^>]*>(Home|Away)<\/td>/gi;
    let schedMatch;
    while ((schedMatch = schedRegex.exec(schedHtml)) !== null) {
      scheduleMatches.push({
        roundNumber: parseInt(schedMatch[1]),
        matchDate: `20${schedMatch[4]}-${schedMatch[2]}-${schedMatch[3]}`,
        opponentTeam: schedMatch[5].trim(),
        isHome: schedMatch[6].toLowerCase() === "home",
      });
    }
  }

  // Create or update league_matches from schedule
  let scheduleCreated = 0;
  let scheduleUpdated = 0;
  for (const sm of scheduleMatches) {
    // Try exact match on date + opponent first (handles double-headers on same date)
    const byOpponent = await db.prepare(
      "SELECT id, round_number, is_home FROM league_matches WHERE team_id = ? AND match_date = ? AND opponent_team = ?"
    ).bind(team.id, sm.matchDate, sm.opponentTeam).first<{ id: string; round_number: number; is_home: number }>();

    if (byOpponent) {
      if (byOpponent.round_number !== sm.roundNumber || byOpponent.is_home !== (sm.isHome ? 1 : 0)) {
        await db.prepare(
          "UPDATE league_matches SET round_number = ?, is_home = ? WHERE id = ?"
        ).bind(sm.roundNumber, sm.isHome ? 1 : 0, byOpponent.id).run();
        scheduleUpdated++;
      }
      continue;
    }

    // Fallback: single match on this date with no opponent yet, or same round + no double-header
    const allOnDate = (await db.prepare(
      "SELECT id, opponent_team, round_number FROM league_matches WHERE team_id = ? AND match_date = ?"
    ).bind(team.id, sm.matchDate).all<{ id: string; opponent_team: string; round_number: number }>()).results;

    if (allOnDate.length === 1 && !allOnDate[0].opponent_team) {
      // Unmatched placeholder — update it
      await db.prepare(
        "UPDATE league_matches SET opponent_team = ?, is_home = ?, round_number = ? WHERE id = ?"
      ).bind(sm.opponentTeam, sm.isHome ? 1 : 0, sm.roundNumber, allOnDate[0].id).run();
      scheduleUpdated++;
    } else {
      await db.prepare(
        "INSERT INTO league_matches (id, team_id, round_number, opponent_team, match_date, is_home, status) VALUES (?, ?, ?, ?, ?, ?, 'open')"
      ).bind(crypto.randomUUID(), team.id, sm.roundNumber, sm.opponentTeam, sm.matchDate, sm.isHome ? 1 : 0).run();
      scheduleCreated++;
    }
  }

  // Sync roster
  const rosterNames: string[] = [];
  const rosterSection = teamHtml.indexOf("Team Roster");
  if (rosterSection > -1) {
    const rosterHtml = teamHtml.substring(rosterSection);
    const rosterRegex = /playermatches\.asp\?id=\d+"?>([^<]+)<\/a>/gi;
    let rm;
    while ((rm = rosterRegex.exec(rosterHtml)) !== null) {
      rosterNames.push(rm[1].trim());
    }
  }

  const teamMembers = (await db.prepare(
    `SELECT tm.player_id, p.name FROM team_memberships tm
     JOIN players p ON p.id = tm.player_id
     WHERE tm.team_id = ? AND tm.active = 1`
  ).bind(team.id).all<{ player_id: string; name: string }>()).results;

  const rosterPlayerIds: string[] = [];
  for (const ustaName of rosterNames) {
    const normalized = normalizeUstaName(ustaName);
    const match = teamMembers.find((m) => m.name.toLowerCase() === normalized);
    if (match) {
      rosterPlayerIds.push(match.player_id);
    } else {
      const resolvedId = resolvePlayer(ustaName);
      if (resolvedId) rosterPlayerIds.push(resolvedId);
    }
  }

  if (rosterNames.length > 0) {
    await db.prepare(
      "UPDATE team_memberships SET usta_registered = 0 WHERE team_id = ? AND active = 1"
    ).bind(team.id).run();
    for (const pid of rosterPlayerIds) {
      await db.prepare(
        "UPDATE team_memberships SET usta_registered = 1 WHERE team_id = ? AND player_id = ?"
      ).bind(team.id, pid).run();
    }
  }

  // Extract scorecards
  const scorecardIds: { id: string; leagueParam: string }[] = [];
  const scRegex1 = /scorecard\.asp\?id=(\d+)&amp;l=([^"&\s]+)/g;
  let scm;
  while ((scm = scRegex1.exec(teamHtml)) !== null) {
    scorecardIds.push({ id: scm[1], leagueParam: scm[2] });
  }
  if (scorecardIds.length === 0) {
    const scRegex2 = /scorecard\.asp\?id=(\d+)&l=([^"&\s]+)/g;
    while ((scm = scRegex2.exec(teamHtml)) !== null) {
      scorecardIds.push({ id: scm[1], leagueParam: scm[2] });
    }
  }

  let updatedCount = 0;

  for (const sc of scorecardIds) {
    const scUrl = `${USTA_BASE}/scorecard.asp?id=${sc.id}&l=${sc.leagueParam}`;
    let scHtml: string;
    try {
      const scResp = await fetch(scUrl);
      scHtml = await scResp.text();
    } catch { continue; }

    const matchDatePos = scHtml.indexOf("Match Date");
    const teamLinkRegex = /teaminfo\.asp\?id=(\d+)/g;
    teamLinkRegex.lastIndex = matchDatePos > -1 ? matchDatePos : 0;
    const firstTeam = teamLinkRegex.exec(scHtml);
    const weAreHome = firstTeam?.[1] === team.usta_team_id;

    const dateMatch = scHtml.match(/(\d{2})\/(\d{2})\/(\d{2})/);
    const matchDateStr = dateMatch ? `20${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}` : "";

    const matchByDate = await db.prepare(
      "SELECT id FROM league_matches WHERE team_id = ? AND match_date = ?"
    ).bind(team.id, matchDateStr).first<{ id: string }>();

    if (!matchByDate) continue;

    const lines: ParsedLine[] = [];
    const singlesStart = scHtml.indexOf("<b>Singles</b>");
    const doublesStart = scHtml.indexOf("<b>Doubles</b>");
    const createDate = scHtml.indexOf("Create date");

    if (singlesStart > -1) {
      const section = scHtml.substring(singlesStart, doublesStart > -1 ? doublesStart : createDate > -1 ? createDate : undefined);
      const sRegex = /<font[^>]*>(\d+)<\/font>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)<\/td>/gi;
      let sm;
      while ((sm = sRegex.exec(section)) !== null) {
        const homeName = sm[2].trim();
        const visitorName = sm[3].trim();
        const score = sm[4].trim();
        const winnerStr = sm[5].toLowerCase();
        const isDefault = score.toLowerCase().includes("def") || score.trim() === "" || score === "&nbsp;";
        const ourName = weAreHome ? homeName : visitorName;
        const won = weAreHome ? winnerStr === "home" : winnerStr === "visitor";
        lines.push({ position: `S${sm[1]}`, p1: resolvePlayer(ourName), p2: null, score, won, isDefault: isDefault && won });
      }
    }

    if (doublesStart > -1) {
      const section = scHtml.substring(doublesStart, createDate > -1 ? createDate : undefined);
      const parsedDoubles = new Set<string>();
      const dRegex = /<font[^>]*>(\d+)<\/font>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)<\/td>/gi;
      let dm;
      while ((dm = dRegex.exec(section)) !== null) {
        parsedDoubles.add(dm[1]);
        const homeP1 = dm[2].trim();
        const homeP2 = dm[3].trim();
        const visP1 = dm[4].trim();
        const visP2 = dm[5].trim();
        const score = dm[6].trim();
        const winnerStr = dm[7].toLowerCase();
        const isDefault = score.toLowerCase().includes("def") || score.trim() === "" || score === "&nbsp;";
        const ourP1 = weAreHome ? homeP1 : visP1;
        const ourP2 = weAreHome ? homeP2 : visP2;
        const won = weAreHome ? winnerStr === "home" : winnerStr === "visitor";
        lines.push({ position: `D${dm[1]}`, p1: resolvePlayer(ourP1), p2: resolvePlayer(ourP2), score, won, isDefault: isDefault && won });
      }

      const dDefaultRegex = /<font[^>]*>(\d+)<\/font>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?Default[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)<\/td>/gi;
      let dd;
      while ((dd = dDefaultRegex.exec(section)) !== null) {
        if (parsedDoubles.has(dd[1])) continue;
        parsedDoubles.add(dd[1]);
        const p1Name = dd[2].trim();
        const p2Name = dd[3].trim();
        const score = dd[4].trim();
        const winnerStr = dd[5].toLowerCase();
        const won = weAreHome ? winnerStr === "home" : winnerStr === "visitor";
        lines.push({ position: `D${dd[1]}`, p1: resolvePlayer(p1Name), p2: resolvePlayer(p2Name), score, won, isDefault: true });
      }
    }

    if (lines.length === 0) continue;

    await db.prepare("DELETE FROM league_match_results WHERE match_id = ?").bind(matchByDate.id).run();

    const stmts = lines.map((line) => {
      const { our, opp } = parseScore(line.score, line.won);
      return db.prepare(
        "INSERT INTO league_match_results (id, match_id, position, won, our_score, opp_score, player1_id, player2_id, is_default_win) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(crypto.randomUUID(), matchByDate.id, line.position, line.won ? 1 : 0, our, opp, line.p1, line.p2, line.isDefault ? 1 : 0);
    });

    const teamRow = await db.prepare("SELECT match_format FROM teams WHERE id = ?").bind(team.id).first<{ match_format: string }>();
    const fmt = JSON.parse(teamRow?.match_format || "{}");
    const ptValues: Record<string, number> = fmt.pointValues || {};

    let ourPoints = 0;
    let theirPoints = 0;
    for (const line of lines) {
      const pts = ptValues[line.position] || 1;
      if (line.won) ourPoints += pts;
      else theirPoints += pts;
    }
    const teamResult = ourPoints > theirPoints ? "Won" : "Lost";
    const teamScore = `${ourPoints}-${theirPoints}`;

    const ustaUrl = `${USTA_BASE}/scorecard.asp?id=${sc.id}&l=${sc.leagueParam}`;
    stmts.push(
      db.prepare("UPDATE league_matches SET status = 'completed', team_result = ?, team_score = ?, usta_url = ? WHERE id = ?")
        .bind(teamResult, teamScore, ustaUrl, matchByDate.id)
    );

    await db.batch(stmts);
    updatedCount++;
  }

  return {
    teamSlug,
    scorecards: scorecardIds.length,
    updated: updatedCount,
    rosterSynced: rosterPlayerIds.length,
    rosterNames,
    scheduleCreated,
    scheduleUpdated,
  };
}
