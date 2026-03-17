"use client";

import { useEffect, useState } from "react";

interface EventSummary {
  event: string;
  cnt: number;
}
interface RecentEvent {
  event: string;
  player_id: string | null;
  player_name: string | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
}
interface LoginAttempt {
  event: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
}
interface DailyActivity {
  day: string;
  cnt: number;
}
interface TopUser {
  player_id: string;
  player_name: string;
  cnt: number;
}

interface CalendarSubscriber {
  player_id: string;
  player_name: string;
  last_fetched_at: string;
}

interface AnalyticsData {
  summary7d: EventSummary[];
  summary30d: EventSummary[];
  recentEvents: RecentEvent[];
  loginAttempts: LoginAttempt[];
  dailyActivity: DailyActivity[];
  topUsers: TopUser[];
  calendarSubscribers: CalendarSubscriber[];
}

const EVENT_LABELS: Record<string, string> = {
  login_requested: "Login Requested",
  login_failed: "Login Failed",
  login_success: "Login Success",
  login_verify_failed: "Magic Link Invalid",
  rsvp_league: "League RSVP",
  rsvp_practice: "Practice RSVP",
  score_submitted: "Score Submitted",
  email_sent: "Email Sent",
  email_failed: "Email Failed",
  "email.delivered": "Delivered",
  "email.opened": "Opened",
  "email.clicked": "Clicked",
  "email.bounced": "Bounced",
  "email.complained": "Spam Report",
  lineup_generated: "Lineup Generated",
  lineup_saved: "Lineup Saved",
  lineup_confirmed: "Lineup Confirmed",
  lineup_confirmed_player: "Player Confirmed",
  lineup_declined_player: "Player Declined",
  match_details_edited: "Match Edited",
  usta_synced: "USTA Synced",
  elo_recalculated: "ELO Recalculated",
  payment_recorded: "Payment Recorded",
  announcement_sent: "Announcement Sent",
  admin_impersonate: "Impersonation",
  preferences_updated: "Preferences Updated",
  calendar_fetched: "Calendar Fetched",
};

const EVENT_COLORS: Record<string, string> = {
  login_requested: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  login_failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  login_success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  login_verify_failed: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  rsvp_league: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  rsvp_practice: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  score_submitted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  email_sent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  email_failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "email.delivered": "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  "email.opened": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "email.clicked": "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  "email.bounced": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "email.complained": "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  lineup_generated: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  lineup_saved: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  lineup_confirmed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  lineup_confirmed_player: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  lineup_declined_player: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  match_details_edited: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  usta_synced: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  elo_recalculated: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  payment_recorded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  announcement_sent: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  admin_impersonate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  preferences_updated: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  calendar_fetched: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
};

function formatDetail(event: string, detail: string | null): string {
  if (!detail) return "—";
  const parts: Record<string, string> = {};
  for (const seg of detail.split(",")) {
    const [k, ...rest] = seg.split(":");
    if (k && rest.length) parts[k] = rest.join(":");
  }

  switch (event) {
    case "rsvp_league":
      return `Match ${parts.match ?? detail.split(":")[0] ?? "?"}: ${detail.split(":").pop() ?? "?"}`;
    case "lineup_generated":
    case "lineup_saved":
    case "lineup_confirmed":
      return `Match ${parts.match ?? "?"}`;
    case "lineup_confirmed_player":
      return `Match ${parts.match ?? "?"}, ${parts.pos ?? ""}`;
    case "lineup_declined_player":
      return `Match ${parts.match ?? "?"}, ${parts.pos ?? ""} — declined`;
    case "match_details_edited":
      return `Match ${parts.match ?? "?"}`;
    case "usta_synced":
      return `${parts.scorecards ?? "?"} scorecards, ${parts.updated ?? "?"} updated`;
    case "elo_recalculated":
      return `${parts.tourney ?? 0} tourney + ${parts.league ?? 0} league, ${parts.updates ?? 0} updates`;
    case "payment_recorded":
      return `Player ${parts.player ?? "?"}, $${((Number(parts.amount) || 0) / 100).toFixed(2)}`;
    case "announcement_sent":
      return `${parts.recipients ?? "?"} recipients — ${parts.subject ?? ""}`;
    case "admin_impersonate":
      return detail === "stopped" ? "Stopped impersonation" : `Viewing as ${parts.target ?? "?"}`;
    case "preferences_updated":
      return `Doubles only: ${parts.doublesOnly ?? "?"}`;
    default:
      return detail;
  }
}

function EventBadge({ event }: { event: string }) {
  const color = EVENT_COLORS[event] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  const label = EVENT_LABELS[event] ?? event;
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [tab, setTab] = useState<"overview" | "logins" | "activity">("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json() as Promise<AnalyticsData>)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-sky-400/30 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) return <p className="text-slate-500">Failed to load analytics.</p>;

  // Fill in full 30-day range (API returns only days with events)
  const dailyMap = new Map((data.dailyActivity ?? []).map((d) => [d.day, d.cnt]));
  const fullDaily: { day: string; cnt: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    fullDaily.push({ day, cnt: dailyMap.get(day) ?? 0 });
  }
  const maxDaily = Math.max(...fullDaily.map((d) => d.cnt), 1);

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {(["overview", "logins", "activity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {t === "overview" ? "Overview" : t === "logins" ? "Login Monitor" : "Activity Log"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* 7-day summary */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Last 7 Days</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.summary7d.map((s) => (
                <div
                  key={s.event}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{s.cnt}</div>
                  <EventBadge event={s.event} />
                </div>
              ))}
              {data.summary7d.length === 0 && (
                <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">No events yet.</p>
              )}
            </div>
          </section>

          {/* Daily chart (simple bar) */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Daily Activity (30 Days)</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Event count per day, oldest → newest (left to right).</p>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-stretch gap-1 h-32">
                {fullDaily.map((d) => {
                      const pct = (d.cnt / maxDaily) * 100;
                      return (
                        <div
                          key={d.day}
                          className="flex-1 min-w-0 flex flex-col justify-end group relative"
                          title={`${d.day}: ${d.cnt} events`}
                        >
                          <div
                            className="w-full bg-sky-500 dark:bg-sky-400 rounded-t transition-all shrink-0"
                            style={{ height: `${Math.max(pct, 3)}%` }}
                          />
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            {d.day}: {d.cnt}
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
          </section>

          {/* Calendar subscribers */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Calendar Subscribers</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Players whose personal calendar feed has been fetched (e.g. added to Google/Apple Calendar). Last fetch = when their calendar app last refreshed.
            </p>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {(data.calendarSubscribers ?? []).map((s) => (
                <div key={s.player_id} className="flex items-center justify-between px-4 py-2.5">
                  <a href={`/player/${s.player_id}`} className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline">
                    {s.player_name}
                  </a>
                  <span className="text-sm text-slate-500 dark:text-slate-400" title={s.last_fetched_at}>
                    {relTime(s.last_fetched_at)}
                  </span>
                </div>
              ))}
              {(data.calendarSubscribers ?? []).length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No calendar fetches yet.</p>
              )}
            </div>
          </section>

          {/* Top users */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Most Active Players (30 Days)</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              {data.topUsers.map((u, i) => (
                <div key={u.player_id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-400 w-6">{i + 1}.</span>
                    <a href={`/player/${u.player_id}`} className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline">
                      {u.player_name}
                    </a>
                  </div>
                  <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">{u.cnt}</span>
                </div>
              ))}
              {data.topUsers.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No data yet.</p>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "logins" && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Login Attempts</h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">Event</th>
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">Email / Detail</th>
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">IP</th>
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.loginAttempts.map((la, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2"><EventBadge event={la.event} /></td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300 font-mono text-xs">{la.detail}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{la.ip ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{relTime(la.created_at)}</td>
                    </tr>
                  ))}
                  {data.loginAttempts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        No login attempts recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === "activity" && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Recent Events</h2>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50 text-left">
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">Event</th>
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">Player</th>
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">Detail</th>
                    <th className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.recentEvents.map((ev, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-2"><EventBadge event={ev.event} /></td>
                      <td className="px-4 py-2">
                        {ev.player_name ? (
                          <a href={`/player/${ev.player_id}`} className="text-sky-600 dark:text-sky-400 hover:underline">
                            {ev.player_name}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs max-w-[250px] truncate">{formatDetail(ev.event, ev.detail)}</td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{relTime(ev.created_at)}</td>
                    </tr>
                  ))}
                  {data.recentEvents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                        No events recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
