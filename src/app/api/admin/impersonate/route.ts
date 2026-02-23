import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const isRealAdmin = session && (session.isImpersonating ? true : session.is_admin === 1);
  if (!isRealAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { playerId } = (await request.json()) as { playerId?: string };

  if (!playerId) {
    const res = NextResponse.json({ ok: true, stopped: true });
    res.cookies.delete("framers_impersonate");
    return res;
  }

  const res = NextResponse.json({ ok: true, impersonating: playerId });
  res.cookies.set("framers_impersonate", playerId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 4, // 4 hours max
  });
  return res;
}
