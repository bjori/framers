import { NextResponse } from "next/server";
import { getSession, canAccessAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const can_admin = await canAccessAdmin(session);
  return NextResponse.json({ user: { ...session, can_admin } });
}
