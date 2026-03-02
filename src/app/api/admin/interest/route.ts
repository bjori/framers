import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !(await canAccessAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action: "approve" | "reject";
    interestId: string;
  };

  const db = await getDB();

  const signup = await db
    .prepare("SELECT * FROM team_interest WHERE id = ?")
    .bind(body.interestId)
    .first<{
      id: string; team_id: string; name: string; email: string; phone: string | null;
      ntrp_rating: number | null; ntrp_type: string | null; status: string;
    }>();

  if (!signup) return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  if (signup.status !== "pending") {
    return NextResponse.json({ error: `Already ${signup.status}` }, { status: 400 });
  }

  if (body.action === "reject") {
    await db.prepare("UPDATE team_interest SET status = 'rejected' WHERE id = ?").bind(body.interestId).run();
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approve: find or create player, add to team
  let playerId: string | null = null;

  const existingPlayer = await db
    .prepare("SELECT id FROM players WHERE email = ?")
    .bind(signup.email)
    .first<{ id: string }>();

  if (existingPlayer) {
    playerId = existingPlayer.id;
  } else {
    playerId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO players (id, name, email, phone, ntrp_rating, ntrp_type) VALUES (?,?,?,?,?,?)"
      )
      .bind(
        playerId, signup.name, signup.email, signup.phone,
        signup.ntrp_rating ?? 3.0, signup.ntrp_type ?? "3.0S"
      )
      .run();
  }

  // Add to team if not already a member
  const existingMembership = await db
    .prepare("SELECT 1 FROM team_memberships WHERE player_id = ? AND team_id = ?")
    .bind(playerId, signup.team_id)
    .first();

  if (!existingMembership) {
    await db
      .prepare("INSERT INTO team_memberships (player_id, team_id, role) VALUES (?, ?, 'player')")
      .bind(playerId, signup.team_id)
      .run();
  }

  await db
    .prepare("UPDATE team_interest SET status = 'approved', player_id = ? WHERE id = ?")
    .bind(playerId, body.interestId)
    .run();

  return NextResponse.json({ ok: true, status: "approved", playerId });
}
