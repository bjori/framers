import { NextRequest, NextResponse } from "next/server";
import { generateMagicToken } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const { email } = (await request.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const token = await generateMagicToken(email);
  if (!token) {
    // Don't reveal whether the email exists
    return NextResponse.json({ ok: true });
  }

  const baseUrl = new URL(request.url).origin;
  const verifyUrl = `${baseUrl}/api/auth/verify?token=${token}`;

  const env = getCloudflareContext().env as { RESEND_API_KEY?: string };
  const resendKey = env.RESEND_API_KEY;

  if (resendKey) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Greenbrook Framers <noreply@framers.app>",
        to: email,
        subject: "Sign in to Greenbrook Framers",
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0c4a6e;">Sign in to Greenbrook Framers</h2>
            <p>Click the button below to sign in. This link expires in 10 minutes.</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #0c4a6e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
              Sign In
            </a>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });
  } else {
    console.log(`[DEV] Magic link for ${email}: ${verifyUrl}`);
  }

  return NextResponse.json({ ok: true });
}
