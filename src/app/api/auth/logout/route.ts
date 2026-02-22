import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDB } from "@/lib/db";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("framers_session")?.value;

  if (token) {
    const db = await getDB();
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }

  cookieStore.delete("framers_session");

  return NextResponse.json({ ok: true });
}
