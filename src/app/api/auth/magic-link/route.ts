import { NextRequest, NextResponse } from "next/server";
import { generateMagicToken } from "@/lib/auth";
import { sendEmail, emailTemplate } from "@/lib/email";
import { track } from "@/lib/analytics";

export async function POST(request: NextRequest) {
  const { email } = (await request.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || undefined;
  const token = await generateMagicToken(email);
  if (!token) {
    await track("login_failed", { detail: email, ip });
    return NextResponse.json({ ok: true });
  }

  const baseUrl = new URL(request.url).origin;
  const verifyUrl = `${baseUrl}/api/auth/verify?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Sign in to Greenbrook Framers",
    html: emailTemplate(
      `<p>Click the button below to sign in. This link expires in 10 minutes.</p>`,
      {
        heading: "Sign In",
        ctaUrl: verifyUrl,
        ctaLabel: "Sign In to Framers",
        footerNote: "If you didn't request this, you can safely ignore this email.",
      }
    ),
  });

  await track("login_requested", { detail: email, ip });
  return NextResponse.json({ ok: true });
}
