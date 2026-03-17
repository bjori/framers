import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/api/auth/magic-link",
  "/api/auth/verify",
  "/api/auth/me",
  "/api/debug",
  "/api/setup",
  "/api/nav",
  "/api/ics",
  "/api/cron",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/api/ics/")) return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/join/")) return true;
  if (pathname.startsWith("/api/team/") && pathname.endsWith("/interest")) return true;
  if (pathname.startsWith("/api/team/") && pathname.endsWith("/info")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/icon-")) return true;
  if (pathname === "/manifest.json") return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = request.cookies.get("framers_session")?.value;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.json).*)",
  ],
};
