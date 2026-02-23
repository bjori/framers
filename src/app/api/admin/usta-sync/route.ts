import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
  "alarcon,jun": "a1b2c3d4-1111-4000-8000-000000000008",
  "mazzoni,stefano": "a1b2c3d4-1111-4000-8000-000000000007",
};

function resolvePlayer(ustaName: string): string | null {
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

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as { teamSlug?: string };
  const db = await getDB();

  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?")
    .bind(body.teamSlug || "").first<{ id: string; usta_team_id: string }>();

  if (!team?.usta_team_id) {
    return NextResponse.json({ error: "Team not found or no USTA team ID" }, { status: 404 });
  }

  const teamUrl = `${USTA_BASE}/teaminfo.asp?id=${team.usta_team_id}`;
  const teamResp = await fetch(teamUrl);
  const teamHtml = await teamResp.text();

  // Extract match time/notes from the schedule table rows
  const schedRowRegex = /(\d{2})\/(\d{2})\/(\d{2})<\/a>.*?<td[^>]*>(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)<\/td>\s*<td>([^<]*)/gi;
  let schedMatch;
  const timeUpdates: { date: string; rawTime: string }[] = [];
  while ((schedMatch = schedRowRegex.exec(teamHtml)) !== null) {
    const d = `20${schedMatch[3]}-${schedMatch[1]}-${schedMatch[2]}`;
    const raw = schedMatch[4].replace(/&nbsp;/g, " ").trim();
    if (raw) timeUpdates.push({ date: d, rawTime: raw });
  }
  // Also catch unlinked dates (future scheduled matches)
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

  // Extract scorecard IDs (handle both &amp; and & encoded)
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

  const results: { scorecardId: string; matchDate: string; lineCount: number; matchId: string | null }[] = [];

  for (const sc of scorecardIds) {
    const scUrl = `${USTA_BASE}/scorecard.asp?id=${sc.id}&l=${sc.leagueParam}`;
    let scHtml: string;
    try {
      const scResp = await fetch(scUrl);
      scHtml = await scResp.text();
    } catch { continue; }

    // Determine home/visitor by finding team links after "Match Date"
    const matchDatePos = scHtml.indexOf("Match Date");
    const teamLinkRegex = /teaminfo\.asp\?id=(\d+)/g;
    teamLinkRegex.lastIndex = matchDatePos > -1 ? matchDatePos : 0;
    const firstTeam = teamLinkRegex.exec(scHtml);
    const weAreHome = firstTeam?.[1] === team.usta_team_id;

    // Extract match date
    const dateMatch = scHtml.match(/(\d{2})\/(\d{2})\/(\d{2})/);
    const matchDateStr = dateMatch ? `20${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}` : "";

    const matchByDate = await db.prepare(
      "SELECT id FROM league_matches WHERE team_id = ? AND match_date = ?"
    ).bind(team.id, matchDateStr).first<{ id: string }>();

    if (!matchByDate) {
      results.push({ scorecardId: sc.id, matchDate: matchDateStr, lineCount: 0, matchId: null });
      continue;
    }

    const lines: ParsedLine[] = [];
    const singlesStart = scHtml.indexOf("<b>Singles</b>");
    const doublesStart = scHtml.indexOf("<b>Doubles</b>");
    const createDate = scHtml.indexOf("Create date");

    // Parse singles
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

    // Parse doubles (handles both normal matches and defaults)
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

      // Catch default lines where opponent has no player links
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

    if (lines.length === 0) {
      results.push({ scorecardId: sc.id, matchDate: matchDateStr, lineCount: 0, matchId: matchByDate.id });
      continue;
    }

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

    stmts.push(
      db.prepare("UPDATE league_matches SET status = 'completed', team_result = ?, team_score = ? WHERE id = ?")
        .bind(teamResult, teamScore, matchByDate.id)
    );

    await db.batch(stmts);
    results.push({ scorecardId: sc.id, matchDate: matchDateStr, lineCount: lines.length, matchId: matchByDate.id });
  }

  return NextResponse.json({
    ok: true,
    scorecards: scorecardIds.length,
    updated: results.filter((r) => r.lineCount > 0).length,
    details: results,
  });
}
