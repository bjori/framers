import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { PracticeRsvpWithCount } from "@/components/practice-rsvp";

interface Attendee {
  player_id: string;
  name: string;
  status: string;
}

export default async function PracticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/practice");

  const { id } = await params;
  const db = await getDB();

  const ps = await db.prepare(
    `SELECT ps.*, t.name as team_name
     FROM practice_sessions ps
     JOIN teams t ON t.id = ps.team_id
     WHERE ps.id = ?`
  ).bind(id).first<{
    id: string; team_id: string; title: string; session_date: string;
    start_time: string; end_time: string; location: string; notes: string | null;
    cancelled: number; team_name: string;
  }>();

  if (!ps) notFound();

  const attendees = (
    await db.prepare(
      `SELECT pr.status, p.name, p.id as player_id
       FROM practice_rsvp pr
       JOIN players p ON p.id = pr.player_id
       WHERE pr.session_id = ?
       ORDER BY
         CASE pr.status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'no' THEN 2 END,
         p.name`
    ).bind(id).all<Attendee>()
  ).results;

  const myRsvp = await db.prepare(
    "SELECT status FROM practice_rsvp WHERE player_id = ? AND session_id = ?"
  ).bind(session.player_id, id).first<{ status: string }>();

  const yesCount = attendees.filter((a) => a.status === "yes").length;
  const maybeCount = attendees.filter((a) => a.status === "maybe").length;
  const noCount = attendees.filter((a) => a.status === "no").length;

  const dateStr = new Date(ps.session_date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Practice", href: "/practice" }, { label: ps.title }]} />
        <h1 className="text-xl font-bold">{ps.title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {dateStr} · {ps.start_time} – {ps.end_time}
        </p>
        <p className="text-sm text-slate-500 mt-0.5">{ps.location}</p>
        {ps.cancelled === 1 && (
          <span className="inline-block mt-2 px-2 py-1 rounded text-xs font-bold uppercase bg-danger/10 text-danger">Cancelled</span>
        )}
        {ps.notes && <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">{ps.notes}</p>}
      </div>

      {!ps.cancelled && (
        <PracticeRsvpWithCount
          sessionId={ps.id}
          currentStatus={myRsvp?.status || null}
          initialYes={yesCount}
          initialMaybe={maybeCount}
        />
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Attendance
          <span className="text-sm font-normal text-slate-500 ml-2">
            {yesCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}{noCount > 0 ? `, ${noCount} can't make it` : ""}
          </span>
        </h2>
        {attendees.length === 0 ? (
          <p className="text-sm text-slate-500">No responses yet. Be the first!</p>
        ) : (
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {attendees.map((a) => (
              <div key={a.player_id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    a.status === "yes" ? "bg-accent" : a.status === "maybe" ? "bg-warning" : "bg-danger"
                  }`} />
                  <Link href={`/player/${a.player_id}`} className="text-sm font-medium text-primary-light hover:underline">
                    {a.name}
                  </Link>
                </div>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  a.status === "yes" ? "bg-accent/10 text-accent" :
                  a.status === "maybe" ? "bg-warning/10 text-warning" :
                  "bg-danger/10 text-danger"
                }`}>{a.status === "yes" ? "Going" : a.status === "maybe" ? "Maybe" : "Can't"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
