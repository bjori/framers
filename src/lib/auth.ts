import { getDB, getKV } from "./db";
import { cookies } from "next/headers";

const SESSION_COOKIE = "framers_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export async function createSession(playerId: string): Promise<string> {
  const token = crypto.randomUUID();
  const db = getDB();
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

  const db = getDB();
  const session = await db
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

  return session;
}

export function setSessionCookie(token: string) {
  return {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}; Secure`,
  };
}

export async function generateMagicToken(email: string): Promise<string | null> {
  const db = getDB();
  const kv = getKV();

  const player = await db
    .prepare("SELECT id FROM players WHERE email = ?")
    .bind(email.toLowerCase().trim())
    .first<{ id: string }>();

  if (!player) return null;

  const magicToken = crypto.randomUUID();
  await kv.put(`magic:${magicToken}`, player.id, { expirationTtl: 600 }); // 10 min

  return magicToken;
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const kv = getKV();
  const playerId = await kv.get(`magic:${token}`);
  if (!playerId) return null;

  await kv.delete(`magic:${token}`);
  return playerId;
}
