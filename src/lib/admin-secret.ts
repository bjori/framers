import { NextRequest } from "next/server";

/**
 * Verifies ADMIN_SECRET for internal endpoints (debug, seed, setup).
 * Accepts: Authorization: Bearer <secret>, X-Admin-Secret: <secret>, or ?key=<secret>
 * Fail closed: if ADMIN_SECRET is not set, returns false (401).
 */
export async function verifyAdminSecret(request: NextRequest): Promise<boolean> {
  const { env } = await import("@opennextjs/cloudflare").then((m) =>
    m.getCloudflareContext({ async: true })
  );
  const secret = env.ADMIN_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerSecret = request.headers.get("x-admin-secret");
  const queryKey = request.nextUrl.searchParams.get("key");

  const provided = bearer ?? headerSecret ?? queryKey ?? "";
  return provided === secret;
}

/**
 * Use for endpoints that MUST be protected. Returns 401 if verification fails.
 */
export async function requireAdminSecret(request: NextRequest) {
  const ok = await verifyAdminSecret(request);
  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
