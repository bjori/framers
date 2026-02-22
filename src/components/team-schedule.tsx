"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LeagueMatch {
  id: string;
  round_number: number;
  opponent_team: string;
  match_date: string;
  match_time: string | null;
  location: string | null;
  is_home: number;
  team_result: string | null;
  team_score: string | null;
  status: string;
}

interface RsvpStatus {
  [matchId: string]: string;
}

interface RsvpCounts {
  [matchId: string]: { yes: number; maybe: number; no: number };
}

export function TeamSchedule({ matches, isReadOnly, slug }: { matches: LeagueMatch[]; isReadOnly: boolean; slug: string }) {
  const [myRsvp, setMyRsvp] = useState<RsvpStatus>({});
  const [counts, setCounts] = useState<RsvpCounts>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (isReadOnly) return;
    // Load all RSVP data
    fetch(`/api/team/${slug}/rsvp`)
      .then((r) => r.json() as Promise<{ availability: { player_id: string; match_id: string; status: string }[] }>)
      .then((data) => {
        fetch("/api/auth/me")
          .then((r) => (r.ok ? (r.json() as Promise<{ user: { player_id: string } } | null>) : null))
          .then((me) => {
            if (!me?.user) return;
            const mine: RsvpStatus = {};
            const cnt: RsvpCounts = {};
            for (const a of data.availability) {
              if (a.player_id === me.user.player_id) mine[a.match_id] = a.status;
              if (!cnt[a.match_id]) cnt[a.match_id] = { yes: 0, maybe: 0, no: 0 };
              if (a.status === "yes") cnt[a.match_id].yes++;
              else if (a.status === "maybe") cnt[a.match_id].maybe++;
              else if (a.status === "no") cnt[a.match_id].no++;
            }
            setMyRsvp(mine);
            setCounts(cnt);
          });
      })
      .catch(() => {});
  }, [isReadOnly, slug]);

  async function handleRsvp(matchId: string, status: "yes" | "no" | "maybe") {
    setSubmitting(matchId);
    const res = await fetch(`/api/team/${slug}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, status }),
    });
    if (res.ok) {
      setMyRsvp((prev) => ({ ...prev, [matchId]: status }));
      setCounts((prev) => {
        const old = prev[matchId] ?? { yes: 0, maybe: 0, no: 0 };
        const oldStatus = myRsvp[matchId];
        const next = { ...old };
        if (oldStatus === "yes") next.yes--;
        else if (oldStatus === "maybe") next.maybe--;
        else if (oldStatus === "no") next.no--;
        if (status === "yes") next.yes++;
        else if (status === "maybe") next.maybe++;
        else if (status === "no") next.no++;
        return { ...prev, [matchId]: next };
      });
    }
    setSubmitting(null);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Schedule</h2>
      <div className="space-y-2">
        {matches.map((m) => {
          const isPast = m.status === "completed";
          const isOpen = m.status === "open";
          const won = m.team_result === "Won";
          const current = myRsvp[m.id];
          const cnt = counts[m.id];

          return (
            <div key={m.id} className="bg-surface-alt rounded-xl border border-border p-4">
              <Link href={`/team/${slug}/match/${m.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        m.is_home ? "bg-accent/10 text-accent" : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                      }`}>
                        {m.is_home ? "HOME" : "AWAY"}
                      </span>
                      <span className="font-semibold text-sm truncate">{m.opponent_team}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {m.match_time ? ` at ${m.match_time}` : ""}
                      {m.location ? ` · ${m.location}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {isPast && m.team_score && (
                      <div>
                        <span className={`text-lg font-bold ${won ? "text-accent" : "text-danger"}`}>
                          {m.team_score}
                        </span>
                        <p className={`text-[10px] font-bold uppercase ${won ? "text-accent" : "text-danger"}`}>
                          {m.team_result}
                        </p>
                      </div>
                    )}
                    {isOpen && isReadOnly && <span className="text-xs text-slate-400">--</span>}
                  </div>
                </div>
              </Link>

              {isOpen && !isReadOnly && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    {(["yes", "maybe", "no"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleRsvp(m.id, s)}
                        disabled={submitting === m.id}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-colors ${
                          current === s
                            ? s === "yes" ? "bg-accent text-white"
                              : s === "maybe" ? "bg-warning text-white"
                              : "bg-danger text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {s === "yes" ? "Yes" : s === "maybe" ? "Maybe" : "No"}
                      </button>
                    ))}
                  </div>
                  {cnt && (cnt.yes > 0 || cnt.maybe > 0 || cnt.no > 0) && (
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      {cnt.yes} yes · {cnt.maybe} maybe · {cnt.no} no
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
