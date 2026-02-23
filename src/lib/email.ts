import { getCloudflareContext } from "@opennextjs/cloudflare";
import { track } from "@/lib/analytics";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Wraps content in the standard Greenbrook Framers email template.
 * @param content - Inner HTML content
 * @param options - Optional overrides for heading, CTA button, etc.
 */
export function emailTemplate(content: string, options?: {
  heading?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footerNote?: string;
}): string {
  const heading = options?.heading ?? "Greenbrook Framers";
  const cta = options?.ctaUrl
    ? `<table role="presentation" style="margin: 24px 0;"><tr><td style="border-radius: 8px; background: #0c4a6e;"><a href="${options.ctaUrl}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px;">${options.ctaLabel ?? "Open App"}</a></td></tr></table>`
    : "";
  const footer = options?.footerNote
    ? `<p style="font-size: 12px; color: #94a3b8; margin-top: 8px;">${options.footerNote}</p>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width: 560px; margin: 0 auto;">

        <!-- Header -->
        <tr><td style="background: linear-gradient(135deg, #0c4a6e 0%, #075985 100%); padding: 24px 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 28px; line-height: 1;">&#127934;</p>
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">${heading}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background: #ffffff; padding: 28px 32px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
          <div style="font-size: 15px; line-height: 1.7; color: #1e293b;">
            ${content}
          </div>
          ${cta}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background: #f8fafc; padding: 16px 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #94a3b8;">
            <a href="https://framers.app/dashboard" style="color: #0369a1; text-decoration: none; font-weight: 600;">framers.app</a>
            &nbsp;&middot;&nbsp; Greenbrook Tennis Community
          </p>
          ${footer}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail({ to, subject, html, from }: SendEmailOptions): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const resendKey = env.RESEND_API_KEY;

  if (!resendKey) {
    console.log(`[EMAIL-DEV] No RESEND_API_KEY — would send to ${to}: ${subject}`);
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
      bcc: to !== "hannes.magnusson@gmail.com" ? "hannes.magnusson@gmail.com" : undefined,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[EMAIL-ERROR] Failed to send to ${to}: ${err}`);
    await track("email_failed", { detail: `${to}|${subject}` }).catch(() => {});
    return false;
  }

  console.log(`[EMAIL-SENT] ${subject} → ${to}`);
  await track("email_sent", { detail: `${to}|${subject}` }).catch(() => {});
  return true;
}
