import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();

  const fees = (
    await db.prepare("SELECT * FROM fees ORDER BY created_at DESC").all<{
      id: string; context_type: string; context_id: string; label: string; amount_cents: number;
    }>()
  ).results;

  const payments = (
    await db.prepare(
      `SELECT pay.*, p.name as player_name, r.name as recorded_by_name
       FROM payments pay
       JOIN players p ON p.id = pay.player_id
       LEFT JOIN players r ON r.id = pay.recorded_by
       ORDER BY pay.paid_at DESC`
    ).all<{
      id: string; player_id: string; fee_id: string; amount_cents: number;
      paid_at: string; notes: string | null; player_name: string; recorded_by_name: string | null;
    }>()
  ).results;

  // Build a summary per fee: who owes what
  const feesSummary = [];
  for (const fee of fees) {
    let memberQuery = "";
    if (fee.context_type === "team") {
      memberQuery = `SELECT p.id, p.name FROM team_memberships tm JOIN players p ON p.id = tm.player_id WHERE tm.team_id = ? AND tm.active = 1 ORDER BY p.name`;
    } else {
      memberQuery = `SELECT p.id, p.name FROM tournament_participants tp JOIN players p ON p.id = tp.player_id WHERE tp.tournament_id = ? ORDER BY p.name`;
    }
    const members = (await db.prepare(memberQuery).bind(fee.context_id).all<{ id: string; name: string }>()).results;

    const playerStatus = members.map((m) => {
      const paid = payments
        .filter((pay) => pay.fee_id === fee.id && pay.player_id === m.id)
        .reduce((sum, pay) => sum + pay.amount_cents, 0);
      return { id: m.id, name: m.name, owed: fee.amount_cents, paid, remaining: fee.amount_cents - paid };
    });

    feesSummary.push({ ...fee, players: playerStatus });
  }

  return NextResponse.json({ fees: feesSummary, payments });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action: string;
    feeId?: string;
    playerId?: string;
    amountCents?: number;
    paidAt?: string;
    notes?: string;
    label?: string;
    contextType?: string;
    contextId?: string;
    amountCentsTotal?: number;
  };

  const db = await getDB();

  if (body.action === "record-payment") {
    if (!body.feeId || !body.playerId || !body.amountCents) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO payments (id, player_id, fee_id, amount_cents, paid_at, recorded_by, notes) VALUES (?,?,?,?,?,?,?)"
    ).bind(id, body.playerId, body.feeId, body.amountCents, body.paidAt || new Date().toISOString(), session.player_id, body.notes || null).run();
    return NextResponse.json({ ok: true, paymentId: id });
  }

  if (body.action === "create-fee") {
    if (!body.label || !body.contextType || !body.contextId || !body.amountCentsTotal) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO fees (id, context_type, context_id, label, amount_cents) VALUES (?,?,?,?,?)"
    ).bind(id, body.contextType, body.contextId, body.label, body.amountCentsTotal).run();
    return NextResponse.json({ ok: true, feeId: id });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
