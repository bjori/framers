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

interface AnalyticsData {
  summary7d: EventSummary[];
  summary30d: EventSummary[];
  recentEvents: RecentEvent[];
  loginAttempts: LoginAttempt[];
  dailyActivity: DailyActivity[];
  topUsers: TopUser[];
}

const EVENT_LABELS: Record<string, string> = {
  login_requested: "Login Requested",
  login_failed: "Login Failed (Unknown Email)",
  login_success: "Login Success",
  login_verify_failed: "Magic Link Invalid",
  rsvp_league: "League RSVP",
  rsvp_practice: "Practice RSVP",
  score_submitted: "Score Submitted",
  email_sent: "Email Sent",
  email_failed: "Email Failed",
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
};

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
  const diff = Date.now() - new Date(iso + "Z").getTime();
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

  const maxDaily = Math.max(...data.dailyActivity.map((d) => d.cnt), 1);

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
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              {data.dailyActivity.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No data yet.</p>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {data.dailyActivity
                    .slice()
                    .reverse()
                    .map((d) => {
                      const pct = (d.cnt / maxDaily) * 100;
                      return (
                        <div
                          key={d.day}
                          className="flex-1 group relative"
                          title={`${d.day}: ${d.cnt} events`}
                        >
                          <div
                            className="w-full bg-sky-500 dark:bg-sky-400 rounded-t transition-all"
                            style={{ height: `${Math.max(pct, 3)}%` }}
                          />
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            {d.day}: {d.cnt}
                          </div>
                        </div>
                      );
                    })}
                </div>
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
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs font-mono max-w-[200px] truncate">{ev.detail ?? "—"}</td>
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
