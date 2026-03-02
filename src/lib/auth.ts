import { getDB, getKV } from "./db";
import { cookies } from "next/headers";

const SESSION_COOKIE = "framers_session";
const IMPERSONATE_COOKIE = "framers_impersonate";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export async function createSession(playerId: string): Promise<string> {
  const token = crypto.randomUUID();
  const db = await getDB();
  const expiresAt = new Date(Date.now() + SESSION_TTL * 1000).toISOString();

  await db
    .prepare("INSERT INTO sessions (token, player_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, playerId, expiresAt)
    .run();

  return token;
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDB();
  const realSession = await db
    .prepare(
      `SELECT s.player_id, p.name, p.email, p.is_admin, p.ntrp_rating, p.ntrp_type
       FROM sessions s
       JOIN players p ON p.id = s.player_id
       WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))`
    )
    .bind(token)
    .first<{
      player_id: string;
      name: string;
      email: string;
      is_admin: number;
      ntrp_rating: number;
      ntrp_type: string;
    }>();

  if (!realSession) return null;

  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (impersonateId && realSession.is_admin === 1) {
    const impersonated = await db
      .prepare("SELECT id as player_id, name, email, is_admin, ntrp_rating, ntrp_type FROM players WHERE id = ?")
      .bind(impersonateId)
      .first<{ player_id: string; name: string; email: string; is_admin: number; ntrp_rating: number; ntrp_type: string }>();

    if (impersonated) {
      return {
        ...impersonated,
        is_admin: impersonated.is_admin,
        isImpersonating: true as const,
        realAdminId: realSession.player_id,
        realAdminName: realSession.name,
      };
    }
  }

  return { ...realSession, isImpersonating: false as const };
}

export function setSessionCookie(token: string) {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}; Secure`,
  };
}

/**
 * Returns true if the session belongs to an admin or a captain/co-captain on any active team.
 * Use this to gate access to the admin panel and admin API routes.
 */
export async function canAccessAdmin(session: Awaited<ReturnType<typeof getSession>>): Promise<boolean> {
  if (!session) return false;
  if (session.is_admin === 1) return true;

  const db = await getDB();
  const captainRole = await db
    .prepare(
      `SELECT 1 FROM team_memberships
       WHERE player_id = ? AND role IN ('captain','co-captain') AND active = 1
       LIMIT 1`
    )
    .bind(session.player_id)
    .first();
  return !!captainRole;
}

export async function generateMagicToken(email: string): Promise<string | null> {
  const db = await getDB();
  const kv = await getKV();

  const player = await db
    .prepare("SELECT id FROM players WHERE email = ?")
    .bind(email.toLowerCase().trim())
    .first<{ id: string }>();

  if (!player) return null;

  const magicToken = crypto.randomUUID();
  await kv.put(`magic:${magicToken}`, player.id, { expirationTtl: 600 });

  return magicToken;
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const kv = await getKV();
  const playerId = await kv.get(`magic:${token}`);
  if (!playerId) return null;

  await kv.delete(`magic:${token}`);
  return playerId;
}
