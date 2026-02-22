import { getCloudflareContext } from "@opennextjs/cloudflare";

const ALLOWED_RECIPIENTS = ["hannes.magnusson@gmail.com"];

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send an email via Resend. Currently gated to only deliver
 * to ALLOWED_RECIPIENTS (admin testing). Everyone else gets
 * a console.log instead.
 */
export async function sendEmail({ to, subject, html, from }: SendEmailOptions): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const resendKey = env.RESEND_API_KEY;

  if (!resendKey) {
    console.log(`[EMAIL-DEV] No RESEND_API_KEY — would send to ${to}: ${subject}`);
    return false;
  }

  if (!ALLOWED_RECIPIENTS.includes(to.toLowerCase().trim())) {
    console.log(`[EMAIL-GATE] Blocked email to ${to} (not in allowed list) — subject: ${subject}`);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: from ?? "Greenbrook Framers <noreply@framers.app>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[EMAIL-ERROR] Failed to send to ${to}: ${err}`);
    return false;
  }

  console.log(`[EMAIL-SENT] ${subject} → ${to}`);
  return true;
}
