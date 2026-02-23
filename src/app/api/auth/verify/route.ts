import { NextRequest, NextResponse } from "next/server";
import { verifyMagicToken, createSession, setSessionCookie } from "@/lib/auth";
import { track } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || undefined;

  if (!token) {
    await track("login_verify_failed", { detail: "missing_token", ip });
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const playerId = await verifyMagicToken(token);
  if (!playerId) {
    await track("login_verify_failed", { detail: "invalid_token", ip });
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
  }

  const sessionToken = await createSession(playerId);
  const headers = setSessionCookie(sessionToken);

  await track("login_success", { playerId, ip });
  return NextResponse.redirect(new URL("/dashboard", request.url), {
    headers,
  });
}
