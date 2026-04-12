import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdminSecret } from "@/lib/admin-secret";
import { calculateElo, seedElo } from "@/lib/elo";
import { sendEmailBatch, emailTemplate, listSender, matchThreadHeaders } from "@/lib/email";
import { detectMilestones, generateMilestoneDigestQuip } from "@/lib/tournament-milestones";

export async function POST(request: NextRequest) {
  const authErr = await requireAdminSecret(request);
  if (authErr) return authErr;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;
    const body = (await request.json()) as { action?: string };

    if (body.action === "recalc-elo") {
      const players = (await db.prepare("SELECT id, ntrp_rating FROM players").all<{ id: string; ntrp_rating: number }>()).results;
      await db.batch(players.map((p) =>
        db.prepare("UPDATE players SET singles_elo=?, doubles_elo=? WHERE id=?").bind(seedElo(p.ntrp_rating), seedElo(p.ntrp_rating), p.id)
      ));
      await db.prepare("DELETE FROM elo_history").run();

      const matches = (await db.prepare(
        `SELECT tm.id, tm.winner_participant_id, tm.participant1_id, tm.participant2_id,
                tm.score1_sets, tm.score2_sets, tp1.player_id as p1_pid, tp2.player_id as p2_pid
         FROM tournament_matches tm
         JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
         JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
         WHERE tm.status='completed' AND tm.bye=0 AND tm.winner_participant_id IS NOT NULL
         ORDER BY tm.scheduled_date ASC, tm.scheduled_time ASC`
      ).all<{ id: string; winner_participant_id: string; participant1_id: string; participant2_id: string; score1_sets: string; score2_sets: string; p1_pid: string; p2_pid: string }>()).results;

      const elo: Record<string, number> = {};
      const mc: Record<string, number> = {};
      for (const p of players) { elo[p.id] = seedElo(p.ntrp_rating); mc[p.id] = 0; }

      const inserts: { pid: string; old: number; neo: number; delta: number; mid: string }[] = [];
      for (const m of matches) {
        const wPid = m.winner_participant_id === m.participant1_id ? m.p1_pid : m.p2_pid;
        const lPid = m.winner_participant_id === m.participant1_id ? m.p2_pid : m.p1_pid;
        let s1: number[] = [], s2: number[] = [];
        try { s1 = JSON.parse(m.score1_sets); } catch {}
        try { s2 = JSON.parse(m.score2_sets); } catch {}
        const wS = m.winner_participant_id === m.participant1_id ? s1 : s2;
        const lS = m.winner_participant_id === m.participant1_id ? s2 : s1;
        let sw = 0, sl = 0;
        for (let i = 0; i < wS.length; i++) { if ((wS[i]??0) > (lS[i]??0)) sw++; else sl++; }
        const r = calculateElo(elo[wPid]??1500, elo[lPid]??1500, true, mc[wPid]??0, mc[lPid]??0, { setsWonByWinner: sw, setsWonByLoser: sl });
        inserts.push({ pid: wPid, old: elo[wPid]??1500, neo: r.newRatingA, delta: r.deltaA, mid: m.id });
        inserts.push({ pid: lPid, old: elo[lPid]??1500, neo: r.newRatingB, delta: r.deltaB, mid: m.id });
        elo[wPid] = r.newRatingA; elo[lPid] = r.newRatingB;
        mc[wPid] = (mc[wPid]??0)+1; mc[lPid] = (mc[lPid]??0)+1;
      }

      for (let i = 0; i < inserts.length; i += 20) {
        await db.batch(inserts.slice(i, i+20).map((e) =>
          db.prepare("INSERT INTO elo_history (id,player_id,type,old_elo,new_elo,delta,source,source_id) VALUES (?,?,?,?,?,?,?,?)")
            .bind(crypto.randomUUID(), e.pid, "singles", e.old, e.neo, e.delta, "tournament_match", e.mid)
        ));
      }
      const upd = Object.entries(elo).map(([pid, e]) => db.prepare("UPDATE players SET singles_elo=? WHERE id=?").bind(e, pid));
      for (let i = 0; i < upd.length; i += 20) { await db.batch(upd.slice(i, i+20)); }

      return NextResponse.json({ ok: true, matchesProcessed: matches.length, eloUpdates: inserts.length });
    }

    if (body.action === "import-availability") {
      const P = {
        allen: "624ef626-b13a-47c9-b23b-6fa96c237f47",
        garrahan: "a1b2c3d4-1111-4000-8000-000000000001",
        gilkey: "269a7039-5e49-47b3-a621-d4c40f3f40b5",
        hocker: "a1b2c3d4-1111-4000-8000-000000000002",
        lopez: "5c591f7a-9f54-4e86-a507-787d2770f028",
        lynch: "a1b2c3d4-1111-4000-8000-000000000003",
        magnusson: "8dbc87ab-f415-40ee-9fed-e7857445f998",
        martinez: "acd5a9ec-d224-466a-a6d1-7b9b28aa961b",
        mccabe: "5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa",
        modi: "e200b62b-e557-47ba-98e8-1dca23d23e0e",
        moran: "a1b2c3d4-1111-4000-8000-000000000004",
        moss: "92e1a868-573c-487e-93c6-3f84488a222c",
        pereida: "eb9d8bcb-ad69-43fc-87c2-d7024060185a",
        shah: "a1b2c3d4-1111-4000-8000-000000000005",
        turner: "a1b2c3d4-1111-4000-8000-000000000006",
        vemuri: "bbbf95a3-2773-4035-8b20-99354ab33a0d",
        zdarko: "ad74e6ea-ffcc-419f-8c15-3dcdf366d490",
      };
      const M = ["lm-sf26-01","lm-sf26-02","lm-sf26-03","lm-sf26-04","lm-sf26-05","lm-sf26-06","lm-sf26-07","lm-sf26-08","lm-sf26-09","lm-sf26-10"];

      type S = "yes"|"no"|"maybe"|null;
      const grid: [string, S[]][] = [
        //                          M1     M2     M3     M4     M5     M6     M7     M8     M9     M10
        [P.allen,     ["yes",  "yes",  "maybe","yes",  "no",   null,   "yes",  "no",   "yes",  "no"]],
        [P.garrahan,  ["yes",  "no",   "yes",  "no",   "yes",  "yes",  "no",   "no",   "yes",  "yes"]],
        [P.gilkey,    ["yes",  "no",   "yes",  "yes",  "no",   "yes",  "yes",  "no",   "no",   "yes"]],
        [P.hocker,    ["yes",  "yes",  "yes",  "yes",  "yes",  "yes",  "no",   "no",   "yes",  "yes"]],
        [P.lopez,     ["no",   "yes",  "yes",  "maybe","yes",  null,   "no",   "yes",  "yes",  "yes"]],
        [P.lynch,     ["yes",  "no",   "no",   "yes",  "maybe","yes",  "maybe","yes",  "yes",  "yes"]],
        [P.magnusson, ["yes",  "no",   "yes",  "yes",  "no",   "yes",  "yes",  "yes",  "yes",  "yes"]],
        [P.martinez,  ["yes",  "yes",  "yes",  "yes",  "yes",  null,   "yes",  "yes",  "yes",  "yes"]],
        [P.mccabe,    ["no",   "yes",  "maybe","yes",  "no",   "yes",  "yes",  "yes",  "no",   "yes"]],
        [P.modi,      ["yes",  "yes",  "no",   "yes",  "yes",  "no",   "yes",  "yes",  "yes",  "yes"]],
        [P.moran,     ["no",   "no",   "yes",  "yes",  "yes",  "no",   "no",   "yes",  "yes",  "no"]],
        [P.moss,      ["yes",  "yes",  "yes",  "yes",  "yes",  "yes",  "no",   "yes",  "no",   "yes"]],
        [P.pereida,   ["yes",  "yes",  "yes",  "yes",  "no",   "yes",  "yes",  "yes",  "yes",  "yes"]],
        [P.shah,      ["no",   "yes",  "yes",  "yes",  "no",   "yes",  "maybe","yes",  "maybe","yes"]],
        [P.turner,    ["yes",  "no",   "yes",  "no",   "no",   "yes",  "no",   "yes",  "yes",  "yes"]],
        [P.vemuri,    ["yes",  "yes",  "yes",  "yes",  "no",   "yes",  "yes",  "no",   "yes",  "yes"]],
        [P.zdarko,    ["yes",  "no",   "yes",  "yes",  "yes",  "no",   "yes",  "yes",  "no",   "yes"]],
      ];

      await db.prepare("DELETE FROM availability WHERE match_id LIKE 'lm-sf26-%'").run();

      const stmts: ReturnType<typeof db.prepare>[] = [];
      for (const [pid, statuses] of grid) {
        for (let i = 0; i < 10; i++) {
          if (statuses[i] === null) continue;
          stmts.push(
            db.prepare("INSERT INTO availability (player_id, match_id, status, responded_at) VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))")
              .bind(pid, M[i], statuses[i])
          );
        }
      }
      for (let i = 0; i < stmts.length; i += 20) {
        await db.batch(stmts.slice(i, i + 20));
      }

      // Set Jeff Turner's doublesOnly preference
      await db.prepare("UPDATE team_memberships SET preferences = ? WHERE player_id = ? AND team_id = 'team-senior-framers-2026'")
        .bind(JSON.stringify({ doublesOnly: true }), P.turner).run();

      // Mark Diablo CC default wins (Match 6 lines)
      // Add is_default_win column if it doesn't exist
      try { await db.prepare("ALTER TABLE league_match_results ADD COLUMN is_default_win INTEGER NOT NULL DEFAULT 0").run(); } catch {}
      // Also add is_forfeit to tournament_matches
      try { await db.prepare("ALTER TABLE tournament_matches ADD COLUMN is_forfeit INTEGER NOT NULL DEFAULT 0").run(); } catch {}

      // Mark Diablo CC D2 (Vemuri/Hocker) and D3 (Garrahan/McCabe) as default wins
      const m6Results = (await db.prepare("SELECT id, position, player1_id, player2_id FROM league_match_results WHERE match_id = 'lm-sf26-06'").all<{id:string;position:string;player1_id:string|null;player2_id:string|null}>()).results;
      const defaulted: string[] = [];
      for (const r of m6Results) {
        const players = [r.player1_id, r.player2_id].filter(Boolean);
        const isDefault = (players.includes(P.vemuri) && players.includes(P.hocker)) ||
                          (players.includes(P.garrahan) && players.includes(P.mccabe));
        if (isDefault) {
          await db.prepare("UPDATE league_match_results SET is_default_win = 1 WHERE id = ?").bind(r.id).run();
          defaulted.push(r.position);
        }
      }

      // Set Matt McCabe as co-captain of Senior Framers
      await db.prepare("UPDATE team_memberships SET role = 'co-captain' WHERE player_id = ? AND team_id = 'team-senior-framers-2026'")
        .bind(P.mccabe).run();

      return NextResponse.json({ ok: true, availabilityRows: stmts.length, defaultedPositions: defaulted });
    }

    if (body.action === "setup-fees") {
      // Create fees + payments tables if they don't exist
      try { await db.prepare("CREATE TABLE IF NOT EXISTS fees (id TEXT PRIMARY KEY, context_type TEXT NOT NULL, context_id TEXT NOT NULL, label TEXT NOT NULL, amount_cents INTEGER NOT NULL, due_date TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))").run(); } catch {}
      try { await db.prepare("CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), fee_id TEXT NOT NULL REFERENCES fees(id), amount_cents INTEGER NOT NULL, paid_at TEXT NOT NULL, recorded_by TEXT REFERENCES players(id), notes TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))").run(); } catch {}

      // Seed fees
      const fees = [
        { id: "fee-senior-2026", type: "team", ctx: "team-senior-framers-2026", label: "Senior Framers 2026 Team Fee", cents: 3500 },
        { id: "fee-tourney-singles-2026", type: "tournament", ctx: "tourney-singles-championship-2026", label: "Singles Championship 2026 Entry ($30 + $10 no-show buffer)", cents: 4000 },
      ];
      for (const f of fees) {
        const exists = await db.prepare("SELECT id FROM fees WHERE id = ?").bind(f.id).first();
        if (!exists) {
          await db.prepare("INSERT INTO fees (id, context_type, context_id, label, amount_cents) VALUES (?,?,?,?,?)")
            .bind(f.id, f.type, f.ctx, f.label, f.cents).run();
        }
      }
      return NextResponse.json({ ok: true, fees });
    }

    if (body.action === "populate-junior") {
      const juniorPlayers = [
        "8dbc87ab-f415-40ee-9fed-e7857445f998",
        "92e1a868-573c-487e-93c6-3f84488a222c","ad74e6ea-ffcc-419f-8c15-3dcdf366d490",
        "bbbf95a3-2773-4035-8b20-99354ab33a0d","a1b2c3d4-1111-4000-8000-000000000006",
        "eb9d8bcb-ad69-43fc-87c2-d7024060185a","5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa",
        "acd5a9ec-d224-466a-a6d1-7b9b28aa961b","a1b2c3d4-3333-4000-8000-000000000001",
        "624ef626-b13a-47c9-b23b-6fa96c237f47","a1b2c3d4-3333-4000-8000-000000000002",
        "269a7039-5e49-47b3-a621-d4c40f3f40b5","a1b2c3d4-1111-4000-8000-000000000003",
        "5c591f7a-9f54-4e86-a507-787d2770f028","a1b2c3d4-1111-4000-8000-000000000005",
        "a1b2c3d4-1111-4000-8000-000000000004",
      ];
      const added: string[] = [];
      for (let i = 0; i < juniorPlayers.length; i++) {
        const pid = juniorPlayers[i];
        const exists = await db.prepare("SELECT 1 FROM team_memberships WHERE player_id=? AND team_id='team-junior-framers-2026'").bind(pid).first();
        if (!exists) {
          await db.prepare("INSERT INTO team_memberships (player_id,team_id,role) VALUES (?,'team-junior-framers-2026',?)").bind(pid, i === 0 ? "captain" : "player").run();
          added.push(pid);
        }
      }
      const total = (await db.prepare("SELECT count(*) as cnt FROM team_memberships WHERE team_id='team-junior-framers-2026'").first<{cnt:number}>())?.cnt;
      return NextResponse.json({ ok: true, added: added.length, total });
    }

    if (body.action === "usta-debug") {
      const scUrl = "https://leagues.ustanorcal.com/scorecard.asp?id=1023186&l=20335:2962";
      const resp = await fetch(scUrl);
      const html = await resp.text();

      // Find "Singles" section and "Doubles" section in raw HTML
      const singlesIdx = html.indexOf("<b>Singles</b>");
      const doublesIdx = html.indexOf("<b>Doubles</b>");
      const createIdx = html.indexOf("Create date");

      const singlesBlock = singlesIdx > -1 && doublesIdx > -1 ? html.substring(singlesIdx, doublesIdx) : "";
      const doublesBlock = doublesIdx > -1 ? html.substring(doublesIdx, createIdx > -1 ? createIdx : undefined) : "";

      // Test our new regex against HTML
      // Singles: look for player links in <a> tags
      const singlesLines: string[] = [];
      const sRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?playermatches\.asp\?id=\d+[^>]*>([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)<\/td>/gi;
      let sm;
      while ((sm = sRegex.exec(singlesBlock)) !== null) {
        singlesLines.push(`S${sm[1]}: ${sm[2]} vs ${sm[3]} | ${sm[4]} | ${sm[5]}`);
      }

      const doublesLines: string[] = [];
      const dRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?playermatches\.asp\?id=\d+[^>]*>([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+[^>]*>([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+[^>]*>([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)<\/td>/gi;
      let dm;
      while ((dm = dRegex.exec(doublesBlock)) !== null) {
        doublesLines.push(`D${dm[1]}: ${dm[2]}/${dm[3]} vs ${dm[4]}/${dm[5]} | ${dm[6]} | ${dm[7]}`);
      }

      return NextResponse.json({
        htmlLen: html.length,
        singlesBlockLen: singlesBlock.length,
        doublesBlockLen: doublesBlock.length,
        singlesLines,
        doublesLines,
        singlesHtml: singlesBlock,
        doublesHtml: doublesBlock.substring(0, 1200),
      });
    }

    if (body.action === "usta-sync") {
      const USTA_BASE = "https://leagues.ustanorcal.com";
      const teamId = "team-senior-framers-2026";
      const ustaTeamId = "108477";

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

      const teamUrl = `${USTA_BASE}/teaminfo.asp?id=${ustaTeamId}`;
      const teamResp = await fetch(teamUrl);
      const teamHtml = await teamResp.text();

      const scorecardRegex = /scorecard\.asp\?id=(\d+)&amp;l=([^"&\s]+)/g;
      const scorecardIds: { id: string; leagueParam: string }[] = [];
      let scm;
      while ((scm = scorecardRegex.exec(teamHtml)) !== null) {
        scorecardIds.push({ id: scm[1], leagueParam: scm[2] });
      }
      // Also try without &amp;
      if (scorecardIds.length === 0) {
        const altRegex = /scorecard\.asp\?id=(\d+)&l=([^"&\s]+)/g;
        while ((scm = altRegex.exec(teamHtml)) !== null) {
          scorecardIds.push({ id: scm[1], leagueParam: scm[2] });
        }
      }

      type ParsedLine = { position: string; p1: string | null; p2: string | null; score: string; won: boolean; isDefault: boolean };
      const allResults: { scorecardId: string; matchDate: string; lines: ParsedLine[]; matchId: string | null }[] = [];

      for (const sc of scorecardIds) {
        const scUrl = `${USTA_BASE}/scorecard.asp?id=${sc.id}&l=${sc.leagueParam}`;
        let scHtml: string;
        try {
          const scResp = await fetch(scUrl);
          scHtml = await scResp.text();
        } catch { continue; }

        // Determine home/visitor: find the two team links in the data row
        // After "Match Date", the first teaminfo link is Home, the second is Visiting
        const matchDatePos = scHtml.indexOf("Match Date");
        const afterHeader = matchDatePos > -1 ? matchDatePos : 0;
        const teamLinkRegex = /teaminfo\.asp\?id=(\d+)/g;
        teamLinkRegex.lastIndex = afterHeader;
        const firstTeam = teamLinkRegex.exec(scHtml);
        const weAreHome = firstTeam?.[1] === ustaTeamId;

        // Match date from header
        const dateMatch = scHtml.match(/(\d{2})\/(\d{2})\/(\d{2})/);
        let matchDateStr = "";
        if (dateMatch) matchDateStr = `20${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;

        const matchByDate = await db.prepare(
          "SELECT id, round_number FROM league_matches WHERE team_id = ? AND match_date = ?"
        ).bind(teamId, matchDateStr).first<{ id: string; round_number: number }>();

        if (!matchByDate) {
          allResults.push({ scorecardId: sc.id, matchDate: matchDateStr, lines: [], matchId: null });
          continue;
        }

        const lines: ParsedLine[] = [];

        // Split HTML into singles and doubles sections
        const singlesStart = scHtml.indexOf("<b>Singles</b>");
        const doublesStart = scHtml.indexOf("<b>Doubles</b>");
        const createDate = scHtml.indexOf("Create date");

        // Parse singles: <font color=#000000>N</font> then two player links, then score, then Home/Visitor
        if (singlesStart > -1) {
          const singlesSection = scHtml.substring(singlesStart, doublesStart > -1 ? doublesStart : createDate > -1 ? createDate : undefined);
          // Pattern: line number in <font>, then player link for home, player link for visitor, score in td, winner in td
          const sRegex = /<font[^>]*>(\d+)<\/font>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)/gi;
          let sm;
          while ((sm = sRegex.exec(singlesSection)) !== null) {
            const lineNum = sm[1];
            const homeName = sm[2].trim();
            const visitorName = sm[3].trim();
            const score = sm[4].trim();
            const winnerStr = sm[5].toLowerCase();
            const isDefault = score.toLowerCase().includes("def") || score.trim() === "" || score === "&nbsp;";
            const ourName = weAreHome ? homeName : visitorName;
            const won = weAreHome ? winnerStr === "home" : winnerStr === "visitor";
            lines.push({ position: `S${lineNum}`, p1: resolvePlayer(ourName), p2: null, score, won, isDefault: isDefault && won });
          }
        }

        // Parse doubles: handle both normal matches and defaults (where opponent may not have player links)
        if (doublesStart > -1) {
          const doublesSection = scHtml.substring(doublesStart, createDate > -1 ? createDate : undefined);
          // First try: 4 player links (normal match)
          const dRegex = /<font[^>]*>(\d+)<\/font>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)/gi;
          const parsedDoubles = new Set<string>();
          let dm;
          while ((dm = dRegex.exec(doublesSection)) !== null) {
            const lineNum = dm[1];
            parsedDoubles.add(lineNum);
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
            lines.push({ position: `D${lineNum}`, p1: resolvePlayer(ourP1), p2: resolvePlayer(ourP2), score, won, isDefault: isDefault && won });
          }

          // Second pass: catch default lines with only 2 player links (opponent defaulted)
          const dDefaultRegex = /<font[^>]*>(\d+)<\/font>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?playermatches\.asp\?id=\d+">([^<]+)<\/a>[\s\S]*?Default[\s\S]*?<td[^>]*>([^<]*)<\/td>[\s\S]*?<td[^>]*>(Home|Visitor)/gi;
          let dd;
          while ((dd = dDefaultRegex.exec(doublesSection)) !== null) {
            const lineNum = dd[1];
            if (parsedDoubles.has(lineNum)) continue;
            parsedDoubles.add(lineNum);
            const p1Name = dd[2].trim();
            const p2Name = dd[3].trim();
            const score = dd[4].trim();
            const winnerStr = dd[5].toLowerCase();
            const won = weAreHome ? winnerStr === "home" : winnerStr === "visitor";
            lines.push({ position: `D${lineNum}`, p1: resolvePlayer(p1Name), p2: resolvePlayer(p2Name), score, won, isDefault: true });
          }
        }

        if (lines.length === 0) {
          allResults.push({ scorecardId: sc.id, matchDate: matchDateStr, lines: [], matchId: matchByDate.id });
          continue;
        }

        // Delete existing results + insert new
        await db.prepare("DELETE FROM league_match_results WHERE match_id = ?").bind(matchByDate.id).run();

        function parseScore(score: string, won: boolean): { our: string; opp: string } {
          const sets = score.split(",").map((s: string) => s.trim());
          const ourParts: string[] = []; const oppParts: string[] = [];
          for (const set of sets) {
            const nums = set.split("-").map((n: string) => n.trim());
            if (nums.length === 2) {
              // USTA shows winner's score first
              if (won) { ourParts.push(nums[0]); oppParts.push(nums[1]); }
              else { ourParts.push(nums[1]); oppParts.push(nums[0]); }
            }
          }
          return { our: ourParts.join(","), opp: oppParts.join(",") };
        }

        const stmts = lines.map((line) => {
          const { our, opp } = parseScore(line.score, line.won);
          return db.prepare(
            "INSERT INTO league_match_results (id, match_id, position, won, our_score, opp_score, player1_id, player2_id, is_default_win) VALUES (?,?,?,?,?,?,?,?,?)"
          ).bind(crypto.randomUUID(), matchByDate.id, line.position, line.won ? 1 : 0, our, opp, line.p1, line.p2, line.isDefault ? 1 : 0);
        });

        // Calculate team score using point values (D1=2 in 40+ leagues)
        const teamRow = await db.prepare("SELECT match_format FROM teams WHERE id = ?").bind(teamId).first<{ match_format: string }>();
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
        allResults.push({ scorecardId: sc.id, matchDate: matchDateStr, lines, matchId: matchByDate.id });
      }

      return NextResponse.json({
        ok: true,
        scorecards: scorecardIds.length,
        updated: allResults.filter((r) => r.lines.length > 0).length,
        results: allResults.map((r) => ({ ...r, lineCount: r.lines.length, lines: r.lines.map((l) => `${l.position}: ${l.p1} ${l.p2 || ""} ${l.won ? "W" : "L"} ${l.score}`) })),
      });
    }

    if (body.action === "record-tourney-payments") {
      const feeId = "fee-tourney-singles-2026";
      const adminId = "8dbc87ab-f415-40ee-9fed-e7857445f998";
      const payers = [
        "5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa", // Matt McCabe
        "acd5a9ec-d224-466a-a6d1-7b9b28aa961b", // Kirk Martinez
        "92e1a868-573c-487e-93c6-3f84488a222c", // Joe Moss
        "269a7039-5e49-47b3-a621-d4c40f3f40b5", // Travis Gilkey
        "bbbf95a3-2773-4035-8b20-99354ab33a0d", // Sri Vemuri
        "624ef626-b13a-47c9-b23b-6fa96c237f47", // Brad Allen
        "5c591f7a-9f54-4e86-a507-787d2770f028", // Dan Lopez
      ];
      const stmts = payers.map((pid) =>
        db.prepare(
          "INSERT INTO payments (id, player_id, fee_id, amount_cents, paid_at, recorded_by, notes) VALUES (?,?,?,?,?,?,?)"
        ).bind(crypto.randomUUID(), pid, feeId, 4000, new Date().toISOString(), adminId, "Paid $40 upfront")
      );
      await db.batch(stmts);
      return NextResponse.json({ ok: true, recorded: payers.length });
    }

    if (body.action === "tr-backfill") {
      const teamName = (body as { teamName?: string }).teamName;
      const isOwn = (body as { isOwn?: boolean }).isOwn ?? false;

      if (!teamName) {
        // Return list of all teams to scout
        const oppTeams = (await db.prepare(
          `SELECT DISTINCT opponent_team FROM league_matches
           WHERE team_id IN (SELECT id FROM teams WHERE status IN ('active','upcoming'))
           AND opponent_team IS NOT NULL`
        ).all<{ opponent_team: string }>()).results;
        return NextResponse.json({
          teams: [
            { name: "GREENBROOK RS 40AM3.0A", isOwn: true },
            ...oppTeams.map((t) => ({ name: t.opponent_team, isOwn: false })),
          ],
        });
      }

      const { scoutOpponent, scoutOwnTeam, getCachedTeam } = await import("@/lib/tr-scouting");
      const { tennisRecordTeamNameFromDisplayName } = await import("@/lib/tr-team-aliases");
      try {
        const scoutName = isOwn ? tennisRecordTeamNameFromDisplayName(teamName) : teamName;
        if (isOwn) {
          await scoutOwnTeam(scoutName, 2026, { force: true });
        } else {
          await scoutOpponent(scoutName, 2026, { force: true });
        }
        const cached = await getCachedTeam(scoutName);
        return NextResponse.json({ ok: true, team: teamName, playerCount: cached.length });
      } catch (e) {
        return NextResponse.json({ ok: false, team: teamName, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    }

    if (body.action === "generate-forms-and-quips") {
      const tournamentSlug = (body as { tournamentSlug?: string }).tournamentSlug ?? "singles-championship-2026";
      const tournament = await db.prepare("SELECT id FROM tournaments WHERE slug = ?").bind(tournamentSlug).first<{ id: string }>();
      if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

      const log: string[] = [];

      // Generate tournament form for all participants
      const { generateTournamentForm, generateLeagueForm } = await import("@/lib/player-form");
      const participants = (await db.prepare(
        "SELECT DISTINCT tp.player_id FROM tournament_participants tp WHERE tp.tournament_id = ?"
      ).bind(tournament.id).all<{ player_id: string }>()).results;

      for (const p of participants) {
        try {
          const form = await generateTournamentForm(p.player_id);
          if (form) log.push(`[Form] ${p.player_id}: ${form}`);
          else log.push(`[Form] ${p.player_id}: skipped (no matches)`);
        } catch (e) {
          log.push(`[Form] ${p.player_id}: error — ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Generate league form for players on active teams
      const leaguePlayers = (await db.prepare(
        `SELECT DISTINCT lmr.player1_id, lmr.player2_id
         FROM league_match_results lmr
         JOIN league_matches lm ON lm.id = lmr.match_id
         WHERE lm.status = 'completed'`
      ).all<{ player1_id: string | null; player2_id: string | null }>()).results;

      const leaguePlayerIds = new Set<string>();
      for (const r of leaguePlayers) {
        if (r.player1_id) leaguePlayerIds.add(r.player1_id);
        if (r.player2_id) leaguePlayerIds.add(r.player2_id);
      }

      for (const pid of leaguePlayerIds) {
        try {
          const form = await generateLeagueForm(pid);
          if (form) log.push(`[LeagueForm] ${pid}: ${form}`);
        } catch (e) {
          log.push(`[LeagueForm] ${pid}: error — ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Regenerate all match quips
      const { regenerateAllQuips } = await import("@/lib/match-predictions");
      try {
        const count = await regenerateAllQuips(tournament.id);
        log.push(`[Quips] Regenerated ${count} match predictions`);
      } catch (e) {
        log.push(`[Quips] error — ${e instanceof Error ? e.message : String(e)}`);
      }

      return NextResponse.json({ ok: true, log });
    }

    if (body.action === "generate-match-preview") {
      const matchId = (body as { matchId?: string }).matchId;
      if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });
      const { generateMatchPreview } = await import("@/lib/league-match-preview");
      const preview = await generateMatchPreview(matchId);
      return NextResponse.json({ ok: true, preview });
    }

    if (body.action === "generate-all-match-previews") {
      const teamSlug = (body as { teamSlug?: string }).teamSlug ?? "senior-framers-2026";
      const upcoming = (await db.prepare(
        `SELECT lm.id FROM league_matches lm
         JOIN teams t ON t.id = lm.team_id
         JOIN lineups l ON l.match_id = lm.id AND l.status IN ('confirmed', 'locked')
         WHERE t.slug = ? AND lm.status NOT IN ('completed', 'cancelled')
           AND lm.match_date >= date('now')
         ORDER BY lm.match_date ASC`
      ).bind(teamSlug).all<{ id: string }>()).results;

      const log: string[] = [];
      const { generateMatchPreview } = await import("@/lib/league-match-preview");
      for (const m of upcoming) {
        try {
          const preview = await generateMatchPreview(m.id);
          log.push(`[Preview] ${m.id}: ${preview ? "generated" : "skipped (no data)"}`);
        } catch (e) {
          log.push(`[Preview] ${m.id}: error — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return NextResponse.json({ ok: true, log });
    }

    if (body.action === "sync-team") {
      const { syncUstaTeam } = await import("@/lib/usta-sync");
      const slug = (body as { teamSlug?: string }).teamSlug ?? "junior-framers-2026";
      const result = await syncUstaTeam(db, slug);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "sync-tr-ratings") {
      const { syncTrRatingsToPlayers } = await import("@/lib/tr-scouting");
      const result = await syncTrRatingsToPlayers(db);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "list-reply-log") {
      const limit = Math.min((body as { limit?: number }).limit ?? 20, 50);
      const [forwarded, failed] = await Promise.all([
        db.prepare(
          `SELECT event, detail, created_at FROM app_events
           WHERE event = 'list_reply_forwarded'
           ORDER BY created_at DESC LIMIT ?`
        )
          .bind(limit)
          .all<{ event: string; detail: string; created_at: string }>(),
        db.prepare(
          `SELECT event, detail, created_at FROM app_events
           WHERE event IN ('list_reply_forwarded_failed', 'list_reply_rejected')
           ORDER BY created_at DESC LIMIT ?`
        )
          .bind(limit)
          .all<{ event: string; detail: string; created_at: string }>(),
      ]);
      return NextResponse.json({
        ok: true,
        forwarded: forwarded.results.map((r) => {
          const parts = r.detail.split("|");
          return {
            listName: parts[0],
            recipients: parts[1],
            sender: parts[2],
            subject: parts.slice(3).join("|"),
            created_at: r.created_at,
          };
        }),
        failed: failed.results.map((r) => ({
          event: r.event,
          detail: r.detail,
          created_at: r.created_at,
        })),
      });
    }

    if (body.action === "send-milestone-digest") {
      const matchId = (body as { matchId?: string }).matchId;
      const listOnly = (body as { list?: boolean }).list;

      if (!matchId && !listOnly) return NextResponse.json({ error: "matchId required (or use list: true to find matches)" }, { status: 400 });

      if (listOnly && !matchId) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const matches = (await db
          .prepare(
            `SELECT tm.id as match_id, t.slug as tournament_slug, t.name as tournament_name,
                    p1.name as p1_name, p2.name as p2_name, tm.updated_at
             FROM tournament_matches tm
             JOIN tournaments t ON t.id = tm.tournament_id
             LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
             LEFT JOIN players p1 ON p1.id = tp1.player_id
             LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
             LEFT JOIN players p2 ON p2.id = tp2.player_id
             WHERE t.status = 'active' AND tm.status = 'completed'
               AND tm.updated_at >= ? AND tm.bye = 0
             ORDER BY tm.updated_at DESC`
          )
          .bind(sevenDaysAgo)
          .all<{ match_id: string; tournament_slug: string; tournament_name: string; p1_name: string; p2_name: string; updated_at: string }>()).results;

        const withMilestones: { match_id: string; tournament_slug: string; p1_name: string; p2_name: string; updated_at: string; milestones: string[] }[] = [];
        for (const m of matches) {
          const milestones = await detectMilestones(db, m.match_id, m.tournament_slug);
          if (milestones.length > 0) {
            withMilestones.push({
              match_id: m.match_id,
              tournament_slug: m.tournament_slug,
              p1_name: m.p1_name,
              p2_name: m.p2_name,
              updated_at: m.updated_at,
              milestones: milestones.map((x) => x.headline),
            });
          }
        }
        return NextResponse.json({
          ok: true,
          matches: withMilestones,
          hint: "Use matchId from a match above to send: { action: 'send-milestone-digest', matchId: '...' }",
        });
      }

      const mid = matchId!;
      const match = await db
        .prepare(
          `SELECT tm.id, t.slug as tournament_slug, t.name as tournament_name
           FROM tournament_matches tm
           JOIN tournaments t ON t.id = tm.tournament_id
           WHERE tm.id = ? AND tm.status = 'completed' AND tm.bye = 0`
        )
        .bind(mid)
        .first<{ id: string; tournament_slug: string; tournament_name: string }>();

      if (!match) return NextResponse.json({ error: "Match not found or not completed" }, { status: 404 });

      const milestones = await detectMilestones(db, mid, match.tournament_slug);
      if (milestones.length === 0) {
        return NextResponse.json({ ok: false, message: "No milestones detected for this match" });
      }

      const participants = (await db
        .prepare(
          `SELECT p.email FROM tournament_participants tp
           JOIN players p ON p.id = tp.player_id
           WHERE tp.tournament_id = (SELECT id FROM tournaments WHERE slug = ?)`
        )
        .bind(match.tournament_slug)
        .all<{ email: string }>()).results;

      const quipHtml = await generateMilestoneDigestQuip(milestones, match.tournament_name);
      const milestoneBlocks = milestones.map((ms) => {
        const matchUrl = `https://framers.app/tournament/${match.tournament_slug}/match/${mid}`;
        const scorePart = ms.score ? ` (${ms.score})` : "";
        return `<p style="margin: 12px 0; font-size: 15px;"><strong>${ms.headline}</strong>${scorePart}</p>
         <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;"><a href="${matchUrl}" style="color: #0369a1;">View match</a></p>`;
      });

      const content = `
        ${quipHtml}
        <p>Quick highlights from the action:</p>
        ${milestoneBlocks.join("")}
      `;

      const digestSender = listSender(match.tournament_slug, match.tournament_name);
      const subject = `${match.tournament_name} — Highlights`;
      const batch = participants.map((p) => ({
        to: p.email,
        subject,
        ...digestSender,
        html: emailTemplate(content, {
          heading: match.tournament_name,
          ctaUrl: `https://framers.app/tournament/${match.tournament_slug}`,
          ctaLabel: "View Tournament",
        }),
      }));

      await sendEmailBatch(batch);
      const today = new Date().toISOString().slice(0, 10);
      await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
        .bind("tournament_daily_milestone", `${match.tournament_slug}|${today}`, new Date().toISOString()).run();
      await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
        .bind("milestone_digest_match", mid, new Date().toISOString()).run();

      return NextResponse.json({
        ok: true,
        matchId: mid,
        tournament: match.tournament_slug,
        milestones: milestones.map((m) => m.headline),
        recipients: participants.length,
      });
    }

    if (body.action === "send-rsvp-nudge") {
      const matchId = (body as { matchId: string }).matchId;
      if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

      const match = await db
        .prepare(
          `SELECT lm.id, lm.opponent_team, lm.match_date,
                  t.name as team_name, t.slug as team_slug
           FROM league_matches lm
           JOIN teams t ON t.id = lm.team_id
           WHERE lm.id = ?`
        )
        .bind(matchId)
        .first<{ id: string; opponent_team: string; match_date: string; team_name: string; team_slug: string }>();

      if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

      const teamId = (await db.prepare("SELECT team_id FROM league_matches WHERE id = ?").bind(matchId).first<{ team_id: string }>())?.team_id;
      if (!teamId) return NextResponse.json({ error: "Match has no team" }, { status: 404 });

      const nonResponders = (
        await db.prepare(
          `SELECT p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm.team_id = ? AND tm.active = 1 AND a.status IS NULL`
        ).bind(matchId, teamId).all<{ name: string }>()
      ).results;

      const members = (
        await db.prepare(
          `SELECT p.email, p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           WHERE tm.team_id = ? AND tm.active = 1`
        ).bind(teamId).all<{ email: string; name: string }>()
      ).results;

      const dateStr = new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      });
      const matchUrl = `https://framers.app/team/${match.team_slug}/match/${matchId}`;

      const nonResponderList =
        nonResponders.length > 0
          ? `<p style="margin: 12px 0; font-size: 15px; font-weight: 600; color: #b45309;">Still need to RSVP: ${nonResponders.map((r) => r.name.split(" ")[0]).join(", ")}</p>
             <p>If that&rsquo;s you — please let us know ASAP so we can plan. It&rsquo;s a school break week and we need to know our numbers.</p>`
          : "<p>Great — everyone has RSVP&rsquo;d! Thanks for the quick responses.</p>";

      const content = `
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">Hey Framers,</h2>
        <p>We need RSVPs for our <strong>first match</strong> against <strong>${match.opponent_team}</strong> on <strong>${dateStr}</strong>.</p>
        ${nonResponderList}
        <p style="margin-top: 16px;">Please RSVP as soon as you can — with school break we need to know early if we can field a full team.</p>
      `;

      const sender = listSender(match.team_slug, match.team_name);
      const batch = members.map((m) => ({
        to: m.email,
        subject: `RSVP needed: Junior Framers vs ${match.opponent_team} (${dateStr})`,
        ...sender,
        html: emailTemplate(content, {
          heading: "RSVP Needed",
          ctaUrl: matchUrl,
          ctaLabel: "RSVP Now",
        }),
        headers: matchThreadHeaders(matchId),
      }));

      await sendEmailBatch(batch);
      return NextResponse.json({
        ok: true,
        sent: members.length,
        nonResponders: nonResponders.map((r) => r.name),
        matchUrl,
      });
    }

    if (body.action === "send-tournament-weekly-digest") {
      const tournamentSlug = (body as { tournamentSlug?: string }).tournamentSlug;
      if (!tournamentSlug) return NextResponse.json({ error: "tournamentSlug required" }, { status: 400 });
      const { gatherDigestData, generateDigestNarrative, buildDigestEmailHtml } = await import("@/lib/tournament-digest");
      const data = await gatherDigestData(db, tournamentSlug);
      if (!data) {
        return NextResponse.json(
          { error: "No digest data (tournament not active, or no scorable results yet)" },
          { status: 400 }
        );
      }
      const narrative = await generateDigestNarrative(data);
      const html = buildDigestEmailHtml(data, narrative);
      const participants = (
        await db.prepare(
          `SELECT p.email FROM tournament_participants tp
           JOIN players p ON p.id = tp.player_id
           WHERE tp.tournament_id = (SELECT id FROM tournaments WHERE slug = ?)`
        ).bind(tournamentSlug).all<{ email: string }>()
      ).results;
      const digestSender = listSender(data.tournamentSlug, data.tournamentName);
      await sendEmailBatch(
        participants.map((p) => ({ to: p.email, subject: data.emailSubject, ...digestSender, html }))
      );
      return NextResponse.json({
        ok: true,
        digestKind: data.digestKind,
        subject: data.emailSubject,
        recipients: participants.length,
        hint: "Sunday cron may skip if tournament_weekly_digest already sent for this date",
      });
    }

    if (body.action === "mark-milestone-sent") {
      const matchIds = (body as { matchIds: string[] }).matchIds;
      if (!Array.isArray(matchIds) || matchIds.length === 0) {
        return NextResponse.json({ error: "matchIds array required" }, { status: 400 });
      }
      const existing = new Set(
        (await db.prepare("SELECT detail FROM app_events WHERE event = 'milestone_digest_match'")
          .all<{ detail: string }>()).results.map((r) => r.detail)
      );
      const toInsert = matchIds.filter((mid) => !existing.has(mid));
      const now = new Date().toISOString();
      for (const mid of toInsert) {
        await db.prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
          .bind("milestone_digest_match", mid, now).run();
      }
      const skipped = matchIds.filter((mid) => existing.has(mid));
      return NextResponse.json({
        ok: true,
        message: `Marked ${toInsert.length} match(es) as already featured${skipped.length > 0 ? ` (${skipped.length} were already marked)` : ""}`,
        inserted: toInsert,
        skipped,
      });
    }

    if (body.action === "send-oneoff-email") {
      const { matchDate, teamSlug, subject: subjectOverride, html: htmlOverride, targetStatuses } = body as {
        matchDate?: string; teamSlug?: string; subject?: string; html?: string;
        targetStatuses?: string[];
      };
      if (!matchDate || !teamSlug || !htmlOverride) {
        return NextResponse.json({ error: "matchDate, teamSlug, and html are required" }, { status: 400 });
      }
      const match = await db.prepare(
        `SELECT lm.id, lm.opponent_team, lm.match_date, t.name as team_name, t.slug as team_slug, t.id as team_id
         FROM league_matches lm JOIN teams t ON t.id = lm.team_id
         WHERE lm.match_date = ? AND t.slug = ?`,
      ).bind(matchDate, teamSlug).first<{
        id: string; opponent_team: string; match_date: string; team_name: string; team_slug: string; team_id: string;
      }>();
      if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

      const statuses = targetStatuses ?? ["no", "none"];
      const statusPlaceholders = statuses.map(() => "?").join(",");
      const recipients = (
        await db.prepare(
          `SELECT p.email, p.name FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm.team_id = ? AND tm.active = 1
             AND COALESCE(a.status, 'none') IN (${statusPlaceholders})`,
        ).bind(match.id, match.team_id, ...statuses).all<{ email: string; name: string }>()
      ).results;

      if (recipients.length === 0) {
        return NextResponse.json({ ok: true, message: "No recipients matched the target statuses", statuses });
      }

      const subj = subjectOverride ?? `${match.team_name} vs ${match.opponent_team} — we need you`;
      const { listSender: listSenderFn, emailTemplate: emailTemplateFn, matchThreadHeaders: matchThreadHeadersFn } = await import("@/lib/email");
      const sender = listSenderFn(match.team_slug, match.team_name);
      const batch = recipients.map((m) => ({
        to: m.email,
        subject: subj,
        ...sender,
        html: emailTemplateFn(
          htmlOverride.replace(/\{\{firstName\}\}/g, m.name.split(" ")[0]),
          {
            heading: match.team_name,
            ctaUrl: `https://framers.app/team/${match.team_slug}/match/${match.id}`,
            ctaLabel: "Open Match & RSVP",
          },
        ),
        headers: matchThreadHeadersFn(match.id),
      }));

      const result = await (await import("@/lib/email")).sendEmailBatch(batch);
      return NextResponse.json({
        ok: true,
        sent: result.sent,
        failed: result.failed,
        recipients: recipients.map((r) => r.name),
        subject: subj,
      });
    }

    if (body.action === "trigger-cron") {
      const cronSecret = env.CRON_SECRET;
      if (!cronSecret) {
        return NextResponse.json({ error: "CRON_SECRET not set on this worker" }, { status: 500 });
      }
      const selfBinding = env.WORKER_SELF_REFERENCE;
      const cronUrl = selfBinding
        ? `https://framers.app/api/cron?key=${encodeURIComponent(cronSecret)}`
        : `https://framers.app/api/cron?key=${encodeURIComponent(cronSecret)}`;
      const cronRes = await fetch(cronUrl);
      const cronBody = await cronRes.json();
      return NextResponse.json({ ok: cronRes.ok, status: cronRes.status, cron: cronBody });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authErr = await requireAdminSecret(request);
  if (authErr) return authErr;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;

    if (!db) {
      return NextResponse.json({ error: "DB binding not found", envKeys: Object.keys(env) });
    }

    const result = await db
      .prepare("SELECT count(*) as cnt FROM players")
      .first<{ cnt: number }>();

    const tournaments = await db
      .prepare("SELECT id, name, slug FROM tournaments LIMIT 5")
      .all();

    return NextResponse.json({
      ok: true,
      playerCount: result?.cnt,
      tournaments: tournaments.results,
    });
  } catch (err) {
    return NextResponse.json({
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
