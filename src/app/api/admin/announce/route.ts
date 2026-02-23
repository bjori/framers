import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendEmail, emailTemplate } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDB();

  // Allow admin or co-captain of the target team
  const body = (await request.json()) as {
    teamId: string;
    subject: string;
    body: string;
    testOnly?: boolean;
  };

  if (!body.teamId || !body.subject || !body.body) {
    return NextResponse.json({ error: "teamId, subject, and body are required" }, { status: 400 });
  }

  const isAdmin = session.is_admin === 1;
  if (!isAdmin) {
    const membership = await db
      .prepare("SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?")
      .bind(session.player_id, body.teamId)
      .first<{ role: string }>();
    if (!membership || (membership.role !== "captain" && membership.role !== "co-captain")) {
      return NextResponse.json({ error: "Only captains and admins can send announcements" }, { status: 403 });
    }
  }

  const team = await db
    .prepare("SELECT id, name FROM teams WHERE id = ?")
    .bind(body.teamId)
    .first<{ id: string; name: string }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const members = (
    await db
      .prepare(
        `SELECT p.email, p.name FROM team_memberships tm
         JOIN players p ON p.id = tm.player_id
         WHERE tm.team_id = ? AND tm.active = 1`
      )
      .bind(body.teamId)
      .all<{ email: string; name: string }>()
  ).results;

  const bodyHtml = emailTemplate(
    `<h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0c4a6e;">${body.subject}</h2>
     <div>${body.body.replace(/\n/g, "<br>")}</div>`,
    {
      heading: team.name,
      ctaUrl: "https://framers.app/dashboard",
      ctaLabel: "Open Greenbrook Framers",
      footerNote: `Sent by ${session.name}`,
    }
  );

  // Test mode: send only to the admin who triggered it
  if (body.testOnly) {
    const senderEmail = await db
      .prepare("SELECT email FROM players WHERE id = ?")
      .bind(session.player_id)
      .first<{ email: string }>();
    if (senderEmail) {
      await sendEmail({
        to: senderEmail.email,
        subject: `[TEST] [${team.name}] ${body.subject}`,
        html: bodyHtml,
      });
    }
    return NextResponse.json({ ok: true, sent: 1, total: members.length, failed: [], testOnly: true });
  }

  let sentCount = 0;
  const failed: string[] = [];

  for (const member of members) {
    const ok = await sendEmail({
      to: member.email,
      subject: `[${team.name}] ${body.subject}`,
      html: bodyHtml,
    });
    if (ok) sentCount++;
    else failed.push(member.email);
  }

  const announcementId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO announcements (id, team_id, subject, body_html, sent_by, recipient_count) VALUES (?,?,?,?,?,?)"
    )
    .bind(announcementId, body.teamId, body.subject, bodyHtml, session.player_id, sentCount)
    .run();

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    total: members.length,
    failed,
    announcementId,
  });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();
  const teamId = request.nextUrl.searchParams.get("teamId");

  const query = teamId
    ? db.prepare(
        `SELECT a.*, p.name as sender_name, t.name as team_name
         FROM announcements a
         JOIN players p ON p.id = a.sent_by
         JOIN teams t ON t.id = a.team_id
         WHERE a.team_id = ?
         ORDER BY a.created_at DESC LIMIT 20`
      ).bind(teamId)
    : db.prepare(
        `SELECT a.*, p.name as sender_name, t.name as team_name
         FROM announcements a
         JOIN players p ON p.id = a.sent_by
         JOIN teams t ON t.id = a.team_id
         ORDER BY a.created_at DESC LIMIT 20`
      );

  const announcements = (await query.all()).results;
  return NextResponse.json({ announcements });
}
