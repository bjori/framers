import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    click?: { link: string; timestamp: string; userAgent: string };
  };
}

const TRACKED_EVENTS = new Set([
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
]);

const TOLERANCE_SECONDS = 300; // 5 minutes

async function verifySignature(
  secret: string,
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string
): Promise<boolean> {
  const ts = parseInt(svixTimestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const secretBytes = Uint8Array.from(atob(secret.replace("whsec_", "")), (c) => c.charCodeAt(0));
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const signatures = svixSignature.split(" ");
  return signatures.some((s) => {
    const val = s.replace(/^v\d+,/, "");
    return val === expected;
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const svixId = request.headers.get("svix-id") ?? "";
  const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
  const svixSignature = request.headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }

  try {
    const { env } = await getCloudflareContext({ async: true });
    const secret = env.RESEND_WEBHOOK_SECRET;
    if (secret) {
      const valid = await verifySignature(secret, rawBody, svixId, svixTimestamp, svixSignature);
      if (!valid) {
        console.error("[webhook/resend] Signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
  } catch (e) {
    console.error("[webhook/resend] Verification error:", e);
    return NextResponse.json({ error: "Verification error" }, { status: 500 });
  }

  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.type || !TRACKED_EVENTS.has(payload.type)) {
    return NextResponse.json({ ok: true });
  }

  const recipient = payload.data.to?.[0] ?? "unknown";
  const subject = payload.data.subject ?? "";
  const clickLink = payload.data.click?.link ?? "";
  const detail = clickLink
    ? `${recipient}|${subject}|${clickLink}`
    : `${recipient}|${subject}`;

  try {
    const db = await getDB();
    await db
      .prepare("INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)")
      .bind(payload.type, detail, payload.created_at || new Date().toISOString())
      .run();
  } catch (e) {
    console.error("[webhook/resend]", e);
  }

  return NextResponse.json({ ok: true });
}
