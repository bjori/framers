import { NextRequest, NextResponse } from "next/server";
import { verifyMagicToken, createSession, setSessionCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const playerId = await verifyMagicToken(token);
  if (!playerId) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
  }

  const sessionToken = await createSession(playerId);
  const headers = setSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/dashboard", request.url), {
    headers,
  });
}
