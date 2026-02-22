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
