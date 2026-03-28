import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PracticeRsvpWithCount, PracticeRsvp } from "@/components/practice-rsvp";
import { filterPracticeSessionsStillOnSchedule, recentEndedPracticeSessions } from "@/lib/practice-schedule";

interface PracticeSession {
  id: string;
  team_id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  location: string;
  notes: string | null;
  cancelled: number;
  team_name: string;
  yes_count: number;
  maybe_count: number;
}

export default async function PracticePage() {
  const session = await getSession();
  if (!session) redirect("/login?redirect=/practice");

  const db = await getDB();

  const practiceCandidates = (
    await db.prepare(
      `SELECT ps.*, t.name as team_name,
              (SELECT COUNT(*) FROM practice_rsvp pr WHERE pr.session_id = ps.id AND pr.status = 'yes') as yes_count,
              (SELECT COUNT(*) FROM practice_rsvp pr WHERE pr.session_id = ps.id AND pr.status = 'maybe') as maybe_count
       FROM practice_sessions ps
       JOIN teams t ON t.id = ps.team_id
       WHERE ps.session_date >= date('now', '-60 days')
       ORDER BY ps.session_date ASC, ps.start_time ASC
       LIMIT 120`
    ).all<PracticeSession>()
  ).results;

  const upcoming = filterPracticeSessionsStillOnSchedule(practiceCandidates).slice(0, 16);
  const past = recentEndedPracticeSessions(practiceCandidates, 4);

  const myRsvps = (
    await db.prepare(
      "SELECT session_id, status FROM practice_rsvp WHERE player_id = ?"
    ).bind(session.player_id).all<{ session_id: string; status: string }>()
  ).results;

  const rsvpMap = Object.fromEntries(myRsvps.map((r) => [r.session_id, r.status]));

  const nextSession = upcoming[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Thursdays 7:30 – 9:00 PM · Greenbrook Tennis Courts
        </p>
      </div>

      {nextSession && (
        <section className="bg-gradient-to-br from-accent/10 to-primary/10 rounded-xl border border-accent/20 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-accent text-white">Next Up</span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {new Date(nextSession.session_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            {nextSession.start_time} – {nextSession.end_time} · {nextSession.location}
            {nextSession.notes && <span className="block mt-1 text-xs">{nextSession.notes}</span>}
          </p>
          <PracticeRsvpWithCount
            sessionId={nextSession.id}
            currentStatus={rsvpMap[nextSession.id] || null}
            initialYes={nextSession.yes_count}
            initialMaybe={nextSession.maybe_count}
          />
          <Link href={`/practice/${nextSession.id}`} className="text-xs text-primary-light hover:underline mt-3 inline-block">
            See who&apos;s coming &rarr;
          </Link>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Upcoming Sessions</h2>
        <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
          {upcoming.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">No upcoming practice sessions.</p>
          )}
          {upcoming.map((s) => (
            <div key={s.id} className={`flex items-center justify-between px-4 py-3 ${s.cancelled ? "opacity-50" : ""}`}>
              <div className="flex-1 min-w-0">
                <Link href={`/practice/${s.id}`} className="font-medium text-sm text-primary-light hover:underline">
                  {new Date(s.session_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Link>
                <p className="text-xs text-slate-500">{s.start_time} – {s.end_time}</p>
                {s.cancelled === 1 && <span className="text-[10px] font-bold text-danger uppercase">Cancelled</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right text-xs mr-2">
                  <span className="text-accent font-semibold">{s.yes_count}</span>
                  {s.maybe_count > 0 && <span className="text-warning ml-1">+{s.maybe_count}</span>}
                </div>
                {!s.cancelled && (
                  <PracticeRsvp sessionId={s.id} currentStatus={rsvpMap[s.id] || null} compact />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-slate-500">Recent</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border opacity-60">
            {past.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-medium text-sm">
                    {new Date(s.session_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{s.yes_count} attended</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
