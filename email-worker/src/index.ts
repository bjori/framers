/**
 * Inbound email router:
 *   - seniors@ / juniors@ / singles@ replies are fanned out to roster members via Resend
 *   - venmo@ processes Venmo payment notifications and auto-records payments
 *
 * Requires RESEND_API_KEY on **framers-email-router**
 * (same key as main app is fine) — it is NOT inherited from greenbrook-framers; set with:
 *   pbpaste | ./scripts/set-email-worker-resend.sh
 * See cloudflare-deployment.mdc.
 */
import PostalMime from "postal-mime";
import { parseVenmoEmail, processVenmoPayment } from "./venmo";

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
}

const ADMIN_FORWARD = "hannes.magnusson@gmail.com";

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

    // --- Venmo payment handler ---
    if (recipient === "venmo@framers.app") {
      await handleVenmoEmail(message, env);
      return;
    }

    // --- Mailing list handler ---
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

    // Parse the inbound email up-front so we can inspect headers + recipients.
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(rawEmail);

    const subject = parsed.subject || "(no subject)";
    const listName = recipient.split("@")[0];
    const listAddress = recipient;

    // --- Loop guard ---
    // Auto-replies, vacation responders, list-server bounces, or our own
    // forwarded copies should NEVER trigger a fan-out. We check standard
    // RFC 3834 / RFC 2076 headers plus our own X-Forwarded-By stamp.
    const headerLookup = parsed.headers ?? [];
    const headerVal = (name: string): string => {
      const lower = name.toLowerCase();
      const hit = headerLookup.find((h) => h.key.toLowerCase() === lower);
      return (hit?.value ?? "").toString().toLowerCase();
    };
    const autoSubmitted = headerVal("auto-submitted");
    const precedence = headerVal("precedence");
    const xForwardedBy = headerVal("x-forwarded-by");
    const isAutoReply =
      (autoSubmitted && autoSubmitted !== "no") ||
      ["bulk", "list", "junk"].includes(precedence) ||
      xForwardedBy.includes("framers-email-router");
    if (isAutoReply) {
      try {
        await env.DB.prepare(
          "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
        )
          .bind(
            "list_reply_rejected",
            `auto_or_loop|${listName}|${senderAddress}|auto-submitted=${autoSubmitted || "-"}|precedence=${precedence || "-"}|forwarded-by=${xForwardedBy || "-"}|${subject}`,
            new Date().toISOString(),
          )
          .run();
      } catch {}
      return;
    }

    // --- Sender allowlist ---
    // Only roster members can fan out a list email. Non-members get
    // forwarded to admin so legitimate "I want to join" inquiries aren't
    // lost, but no fan-out happens.
    const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
    if (!memberEmails.has(senderAddress)) {
      await forwardToAdmin(env, {
        listName,
        listAddress,
        senderAddress,
        senderName: parsed.from?.name || senderAddress,
        subject,
        html:
          parsed.html ||
          (parsed.text
            ? `<pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(parsed.text)}</pre>`
            : "<p>(empty message)</p>"),
      });
      try {
        await env.DB.prepare(
          "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
        )
          .bind(
            "list_reply_rejected",
            `non_member|${listName}|${senderAddress}|forwarded_to_admin|${subject}`,
            new Date().toISOString(),
          )
          .run();
      } catch {}
      return;
    }

    const htmlBody =
      parsed.html ||
      (parsed.text
        ? `<pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(parsed.text)}</pre>`
        : "<p>(empty message)</p>");
    const senderName = parsed.from?.name || senderAddress.split("@")[0];

    // --- Cc-aware fan-out dedup ---
    // If the inbound email already addressed roster members directly (To or
    // Cc), they got a real copy from the sender. Skip them here so we don't
    // double-deliver. This is the main fix for the "I got the same reply
    // twice" problem when somebody hits Reply-All with personal addresses
    // alongside the list.
    const directlyAddressed = new Set<string>();
    for (const list of [parsed.to ?? [], parsed.cc ?? []]) {
      for (const a of list) {
        const e = (a?.address ?? "").trim().toLowerCase();
        if (e) directlyAddressed.add(e);
      }
    }
    // The list address itself is always in to/cc — that's not a "direct"
    // recipient, ignore it.
    directlyAddressed.delete(listAddress.toLowerCase());

    const recipients = members.filter((m) => {
      const lc = m.email.toLowerCase();
      if (lc === senderAddress) return false; // sender filter
      if (directlyAddressed.has(lc)) return false; // already received it directly
      return true;
    });

    const skippedDirect = members.filter(
      (m) => directlyAddressed.has(m.email.toLowerCase()) && m.email.toLowerCase() !== senderAddress,
    );

    if (recipients.length === 0) {
      try {
        await env.DB.prepare(
          "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
        )
          .bind(
            "list_reply_rejected",
            `no_recipients_after_dedup|${listName}|${senderAddress}|skipped=${skippedDirect.length}|${subject}`,
            new Date().toISOString(),
          )
          .run();
      } catch {}
      return;
    }

    // Reply-To points back at the list so hitting "Reply" in any client
    // fans the message out to everyone (group-convo behavior instead of a
    // one-way blast). Standard List-* headers make Gmail/Apple Mail/etc.
    // recognize this as a mailing list and surface the "Reply to list" UI.
    // X-Forwarded-By is our own loop-guard stamp so we recognize and reject
    // any email that's somehow already passed through this worker.
    const listHeaders: Record<string, string> = {
      "List-Id": `${listName} <${listName}.framers.app>`,
      "List-Post": `<mailto:${listAddress}>`,
      "List-Unsubscribe": `<mailto:captain@framers.app?subject=unsubscribe%20${listName}>`,
      "List-Archive": `<https://framers.app>`,
      "X-Forwarded-By": "framers-email-router",
      "Auto-Submitted": "auto-forwarded",
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
      const detail = `${listName}|${totalSent} recipients|${senderAddress}|skipped_direct=${skippedDirect.length}|${subject}`;
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

/**
 * Forward an email from a non-roster sender to the admin so legitimate
 * inbound from outsiders ("hey, can I join the team?") isn't black-holed.
 * Subject and intro make it crystal clear this came in via framers.app
 * and didn't get fanned out to the roster.
 */
async function forwardToAdmin(
  env: Env,
  args: {
    listName: string;
    listAddress: string;
    senderAddress: string;
    senderName: string;
    subject: string;
    html: string;
  },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log("[EMAIL-WORKER] No RESEND_API_KEY, skipping admin forward");
    return;
  }
  const noticeBanner = `<div style="margin: 0 0 16px 0; padding: 12px 14px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #78350f;">
    <p style="margin: 0 0 6px 0; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">framers.app — non-roster email</p>
    <p style="margin: 0; line-height: 1.55;"><strong>${escapeHtml(args.senderName)}</strong> &lt;${escapeHtml(args.senderAddress)}&gt; emailed <strong>${escapeHtml(args.listAddress)}</strong> but is not on the active roster. The message was <strong>not</strong> fanned out to the team. Could be someone wanting to join, a misdirected reply, or spam. Reply directly to the sender if it&rsquo;s legit.</p>
  </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Framers Mail Router <captain@framers.app>",
        to: ADMIN_FORWARD,
        subject: `[framers.app non-roster → ${args.listName}@] ${args.subject}`,
        html: noticeBanner + args.html,
        reply_to: args.senderAddress,
        headers: {
          "X-Forwarded-By": "framers-email-router",
          "Auto-Submitted": "auto-forwarded",
        },
      }),
    });
  } catch (e) {
    console.error("[EMAIL-WORKER] Failed to forward non-roster email to admin:", e);
  }
}

async function handleVenmoEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const rawEmail = await new Response(message.raw).arrayBuffer();
  const parsed = await new PostalMime().parse(rawEmail);
  const subject = parsed.subject || "";
  const html = parsed.html || parsed.text || "";
  const sender = extractEmail(message.from);

  // Always forward to admin so they can see all emails sent to this address
  // (account verification emails, receipts, etc.)
  if (env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `Venmo Forwarder <captain@framers.app>`,
          to: ADMIN_FORWARD,
          subject: `[venmo@] ${subject}`,
          html: parsed.html || `<pre style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(parsed.text || "(empty)")}</pre>`,
          reply_to: sender,
        }),
      });
    } catch (e) {
      console.error("[VENMO] Failed to forward email to admin:", e);
    }
  }

  // Only process emails from Venmo
  if (!sender.includes("venmo.com") && !sender.includes("amazonses.com")) {
    try {
      await env.DB.prepare(
        "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
      ).bind("venmo_email_non_venmo", `from:${sender}|subject:${subject}`, new Date().toISOString()).run();
    } catch {}
    return;
  }

  const payment = parseVenmoEmail(subject, html);
  if (!payment) {
    try {
      await env.DB.prepare(
        "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
      ).bind("venmo_email_unparsed", `from:${sender}|subject:${subject}`, new Date().toISOString()).run();
    } catch {}
    return;
  }

  try {
    const result = await processVenmoPayment(payment, env.DB, env.RESEND_API_KEY);
    console.log(`[VENMO] ${result}`);
    try {
      await env.DB.prepare(
        "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
      ).bind("venmo_payment_processed", result, new Date().toISOString()).run();
    } catch {}
  } catch (e) {
    console.error("[VENMO] Processing error:", e);
    try {
      await env.DB.prepare(
        "INSERT INTO app_events (event, detail, created_at) VALUES (?, ?, ?)"
      ).bind("venmo_payment_error", `${subject}|${e instanceof Error ? e.message : String(e)}`, new Date().toISOString()).run();
    } catch {}
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
