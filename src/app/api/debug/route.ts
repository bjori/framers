import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { calculateElo, seedElo } from "@/lib/elo";

export async function POST(request: NextRequest) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;
    const body = (await request.json()) as { action?: string };

    if (body.action === "fix-players") {
      const updates = [
        ["624ef626-b13a-47c9-b23b-6fa96c237f47","ballen636@gmail.com","949-637-0773",3.0,"3.0A"],
        ["5c591f7a-9f54-4e86-a507-787d2770f028","lopezdc67@yahoo.com","925-207-3498",3.0,"3.0C"],
        ["8dbc87ab-f415-40ee-9fed-e7857445f998","hannes.magnusson@gmail.com","650-666-9246",3.0,"3.0C"],
        ["92e1a868-573c-487e-93c6-3f84488a222c","joegmoss@hotmail.com","510-282-8250",2.5,"2.5A"],
        ["ad74e6ea-ffcc-419f-8c15-3dcdf366d490","jzdarko@gmail.com","805-234-4899",3.0,"3.0C"],
        ["acd5a9ec-d224-466a-a6d1-7b9b28aa961b","kirk.martinez@gmail.com","925-314-5089",2.5,"2.5S"],
        ["5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa","mccabe83@gmail.com","661-433-3731",3.0,"3.0C"],
        ["e200b62b-e557-47ba-98e8-1dca23d23e0e","shimonmodi@gmail.com","765-409-6634",3.0,"3.0C"],
        ["bbbf95a3-2773-4035-8b20-99354ab33a0d","srivemuri3@gmail.com","510-338-8768",3.0,"3.0C"],
        ["269a7039-5e49-47b3-a621-d4c40f3f40b5","travisgilkey@gmail.com","925-787-2196",3.0,"3.0C"],
        ["eb9d8bcb-ad69-43fc-87c2-d7024060185a","tristanpr@gmail.com","310-749-5634",2.5,"2.5C"],
        ["a1b2c3d4-1111-4000-8000-000000000001","juangarrahan@comcast.net","925-381-1652",3.0,"3.0C"],
        ["a1b2c3d4-1111-4000-8000-000000000002","guyhocker@gmail.com","310-809-1403",3.0,"3.0S"],
        ["a1b2c3d4-1111-4000-8000-000000000003","kelly@westernstatestool.com","510-714-6117",3.0,"3.0C"],
        ["a1b2c3d4-1111-4000-8000-000000000004","jeffreykmoran@gmail.com","925-708-1826",3.0,"3.0C"],
        ["a1b2c3d4-1111-4000-8000-000000000005","bravebhaven@gmail.com","650-305-6380",3.0,"3.0C"],
        ["a1b2c3d4-1111-4000-8000-000000000006","jmmmat@sbcglobal.net","510-520-1515",3.0,"3.0C"],
        ["a1b2c3d4-2222-4000-8000-000000000001","unknown+sandeep.b@framers.app",null,3.0,"3.0S"],
        ["a1b2c3d4-2222-4000-8000-000000000002","unknown+tim.gilliss@framers.app",null,2.5,"2.5S"],
        ["a1b2c3d4-2222-4000-8000-000000000003","unknown+kirill.mazin@framers.app",null,3.0,"3.0S"],
      ] as const;
      const updates2 = [
        ["a1b2c3d4-2222-4000-8000-000000000004","unknown+aaron.kaplan@framers.app",null,3.0,"3.0C"],
        ["a1b2c3d4-2222-4000-8000-000000000005","unknown+tom.schroder@framers.app",null,2.5,"2.5S"],
      ] as const;

      await db.batch(updates.map(([id,email,phone,rating,type]) =>
        db.prepare("UPDATE players SET email=?, phone=?, ntrp_rating=?, ntrp_type=? WHERE id=?").bind(email,phone,rating,type,id)
      ));
      await db.batch(updates2.map(([id,email,phone,rating,type]) =>
        db.prepare("UPDATE players SET email=?, phone=?, ntrp_rating=?, ntrp_type=? WHERE id=?").bind(email,phone,rating,type,id)
      ));

      const newPlayers = [
        ["a1b2c3d4-3333-4000-8000-000000000001","Stefano Mazzoni","stefanoheidi@gmail.com",3.0,"3.0S"],
        ["a1b2c3d4-3333-4000-8000-000000000002","Jun Alarcon","alarconjun@yahoo.com",3.0,"3.0S"],
      ] as const;
      for (const [id,name,email,rating,type] of newPlayers) {
        const exists = await db.prepare("SELECT id FROM players WHERE id=?").bind(id).first();
        if (!exists) {
          await db.prepare("INSERT INTO players (id,name,email,ntrp_rating,ntrp_type) VALUES (?,?,?,?,?)").bind(id,name,email,rating,type).run();
          await db.prepare("INSERT OR IGNORE INTO team_memberships (player_id,team_id,role) VALUES (?,'team-junior-framers-2026','player')").bind(id).run();
        }
      }

      const players = (await db.prepare("SELECT id,name,email,phone,ntrp_rating,ntrp_type FROM players ORDER BY name").all()).results;
      return NextResponse.json({ ok: true, updated: updates.length + updates2.length, newPlayers: newPlayers.length, players });
    }

    if (body.action === "import-2025") {
      const { HISTORICAL_2025_MATCHES } = await import("@/lib/historical-2025-data");
      await db.prepare("DELETE FROM league_match_results WHERE match_id LIKE 'hist-2025-%'").run();
      await db.prepare("DELETE FROM league_matches WHERE id LIKE 'hist-2025-%'").run();

      for (let i = 0; i < HISTORICAL_2025_MATCHES.length; i++) {
        const match = HISTORICAL_2025_MATCHES[i];
        const matchId = `hist-2025-${String(i + 1).padStart(2, "0")}`;
        const isHome = match.homeTeam === "us" ? 1 : 0;
        const result = match.ourScore > match.theirScore ? "win" : "loss";

        await db.prepare(
          `INSERT INTO league_matches (id, team_id, round_number, opponent_team, match_date, is_home, team_result, team_score, status) VALUES (?,?,?,?,?,?,?,?,'completed')`
        ).bind(matchId, match.teamId, i + 1, match.opponent, match.date, isHome, result, `${match.ourScore}-${match.theirScore}`).run();

        for (let li = 0; li < match.lines.length; li++) {
          const line = match.lines[li];
          const pos = `${line.type === "singles" ? "S" : "D"}${line.position}`;
          const ourSide = match.homeTeam === "us" ? "home" : "visitor";
          const won = line.winReversed ? 0 : (ourSide === line.winner ? 1 : 0);
          const players = (ourSide === "home" ? line.homePlayers : line.visitorPlayers).filter((p): p is string => p !== null);
          const ourScores = line.score.split(",").map(s => { const p = s.trim().split("-").map(Number); return ourSide === "home" ? p[0] : p[1]; }).join(",");
          const oppScores = line.score.split(",").map(s => { const p = s.trim().split("-").map(Number); return ourSide === "home" ? p[1] : p[0]; }).join(",");
          await db.prepare(
            `INSERT INTO league_match_results (id, match_id, position, won, our_score, opp_score, player1_id, player2_id) VALUES (?,?,?,?,?,?,?,?)`
          ).bind(`${matchId}-${li+1}`, matchId, pos, won, ourScores, oppScores, players[0] ?? null, players[1] ?? null).run();
        }
      }
      return NextResponse.json({ ok: true, imported: HISTORICAL_2025_MATCHES.length });
    }

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

    if (body.action === "matt-junior-cocaptain") {
      const mattId = "5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa";
      const teamId = "team-junior-framers-2026";
      const existing = await db.prepare("SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?").bind(mattId, teamId).first<{ role: string }>();
      if (existing) {
        await db.prepare("UPDATE team_memberships SET role = 'co-captain' WHERE player_id = ? AND team_id = ?").bind(mattId, teamId).run();
        return NextResponse.json({ ok: true, action: "updated", previousRole: existing.role });
      } else {
        await db.prepare("INSERT INTO team_memberships (player_id, team_id, role) VALUES (?, ?, 'co-captain')").bind(mattId, teamId).run();
        return NextResponse.json({ ok: true, action: "inserted" });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
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
