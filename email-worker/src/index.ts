/**
 * Inbound email router: replies to seniors@ / juniors@ / singles@ are fanned out
 * to roster members via Resend batch API. Requires RESEND_API_KEY on **framers-email-router**
 * (same key as main app is fine) — it is NOT inherited from greenbrook-framers; set with:
 *   pbpaste | ./scripts/set-email-worker-resend.sh
 * See cloudflare-deployment.mdc.
 */
import PostalMime from "postal-mime";

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
}

// Map list addresses to DB lookups
// "type" determines which table to query for members
const LIST_CONFIG: Record<string, { slug: string; type: "team" | "tournament" }> = {
  "seniors@framers.app": { slug: "senior-framers-2026", type: "team" },
  "juniors@framers.app": { slug: "junior-framers-2026", type: "team" },
  "singles@framers.app": { slug: "singles-championship-2026", type: "tournament" },
};

async function getListMembers(db: D1Database, config: { slug: string; type: "team" | "tournament" }): Promise<{ email: string; name: string }[]> {
  if (config.type === "team") {
    return (await db.prepare(
      `SELECT p.email, p.name FROM team_memberships tm
       JOIN players p ON p.id = tm.player_id
       WHERE tm.team_id = (SELECT id FROM teams WHERE slug = ?) AND tm.active = 1`
    ).bind(config.slug).all<{ email: string; name: string }>()).results;
  }

  return (await db.prepare(
    `SELECT p.email, p.name FROM tournament_participants tp
     JOIN players p ON p.id = tp.player_id
     WHERE tp.tournament_id = (SELECT id FROM tournaments WHERE slug = ?)`
  ).bind(config.slug).all<{ email: string; name: string }>()).results;
}

function extractEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const recipient = extractEmail(message.to);
    const config = LIST_CONFIG[recipient];

    if (!config) {
      try {
        await env.DB.prepare(
          "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
        )
          .bind("list_reply_rejected", `no_such_list|${recipient}|${extractEmail(message.from)}`, new Date().toISOString())
          .run();
      } catch {}
      message.setReject("550 No such list");
      return;
    }

    const senderAddress = extractEmail(message.from);

    const members = await getListMembers(env.DB, config);
    if (members.length === 0) {
      try {
        await env.DB.prepare(
          "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
        )
          .bind("list_reply_rejected", `empty_list|${recipient}|${config.slug}`, new Date().toISOString())
          .run();
      } catch {}
      message.setReject("550 List has no members");
      return;
    }

    // Parse the inbound email to extract subject, text, and HTML
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(rawEmail);

    const subject = parsed.subject || "(no subject)";
    const htmlBody = parsed.html || (parsed.text ? `<pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(parsed.text)}</pre>` : "<p>(empty message)</p>");

    // Extract sender display name from the From header
    const senderName = parsed.from?.name || senderAddress.split("@")[0];

    // Filter out sender so they don't get their own email
    const recipients = members.filter((m) => m.email.toLowerCase() !== senderAddress);
    if (recipients.length === 0) {
      try {
        await env.DB.prepare(
          "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
        )
          .bind("list_reply_rejected", `sender_only_member|${recipient}|${senderAddress}|${subject}`, new Date().toISOString())
          .run();
      } catch {}
      return;
    }

    const listName = recipient.split("@")[0];
    const listAddress = recipient;
    // Reply-To points back at the list so hitting "Reply" in any client
    // fans the message out to everyone (group-convo behavior instead of a
    // one-way blast). Standard List-* headers make Gmail/Apple Mail/etc.
    // recognize this as a mailing list and surface the "Reply to list" UI.
    const listHeaders: Record<string, string> = {
      "List-Id": `${listName} <${listName}.framers.app>`,
      "List-Post": `<mailto:${listAddress}>`,
      "List-Unsubscribe": `<mailto:captain@framers.app?subject=unsubscribe%20${listName}>`,
      "List-Archive": `<https://framers.app>`,
      "X-Original-From": senderAddress,
    };
    const payload = recipients.map((r) => ({
      from: `${senderName} via Framers <captain@framers.app>`,
      to: r.email,
      subject: subject.startsWith(`[${listName}]`) ? subject : `[${listName}] ${subject}`,
      html: htmlBody,
      reply_to: listAddress,
      headers: listHeaders,
      tracking: { open: false, click: false },
    }));

    // Resend batch API max 100 per call
    let totalSent = 0;
    for (let i = 0; i < payload.length; i += 100) {
      const batch = payload.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[EMAIL-WORKER] Batch send failed: ${errText}`);
        try {
          await env.DB.prepare(
            "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
          )
            .bind("list_reply_forwarded_failed", `${listName}|${senderAddress}|${subject}|${errText}`, new Date().toISOString())
            .run();
        } catch (e) {
          console.error(`[EMAIL-WORKER] Failed to log failure:`, e);
        }
        return;
      }
      totalSent += batch.length;
      console.log(`[EMAIL-WORKER] Forwarded to ${batch.length} recipients on ${listName}`);
    }

    // Log to app_events so we can verify replies were forwarded
    try {
      const detail = `${listName}|${totalSent} recipients|${senderAddress}|${subject}`;
      await env.DB.prepare(
        "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
      )
        .bind("list_reply_forwarded", detail, new Date().toISOString())
        .run();
    } catch (e) {
      console.error(`[EMAIL-WORKER] Failed to log app_event:`, e);
    }
  },
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
