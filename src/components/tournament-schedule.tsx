"use client";

import { useState } from "react";
import Link from "next/link";

export interface TournamentMatch {
  id: string;
  week: number;
  round: number;
  match_number: number;
  participant1_id: string;
  participant2_id: string;
  winner_participant_id: string | null;
  score1_sets: string | null;
  score2_sets: string | null;
  scheduled_date: string;
  scheduled_time: string;
  court: string;
  status: string;
  bye: number;
  p1_name: string;
  p2_name: string;
  p1_player_id: string;
  p2_player_id: string;
}

type Filter = "all" | "completed" | "upcoming" | "needs-score";

function parseScore(s: string | null): number[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function formatScore(s1: string | null, s2: string | null, winnerId: string | null, p1Id: string): string {
  const sets1 = parseScore(s1);
  const sets2 = parseScore(s2);
  if (sets1.length === 0) return "";
  const isP1Winner = winnerId === p1Id;
  return sets1.map((g, i) => {
    const a = isP1Winner ? g : sets2[i];
    const b = isP1Winner ? sets2[i] : g;
    return `${a}-${b}`;
  }).join(", ");
}

function getMatchStatus(m: TournamentMatch): "completed" | "needs-score" | "upcoming" {
  if (m.status === "completed") return "completed";
  const now = new Date();
  const matchDate = new Date(m.scheduled_date + "T" + (m.scheduled_time || "23:59"));
  if (matchDate < now) return "needs-score";
  return "upcoming";
}

export function TournamentSchedule({ matches, slug }: { matches: TournamentMatch[]; slug: string }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = matches.filter((m) => {
    if (m.bye) return false;
    if (filter === "all") return true;
    return getMatchStatus(m) === filter;
  });

  const grouped = filtered.reduce<Record<number, TournamentMatch[]>>((acc, m) => {
    (acc[m.week] ||= []).push(m);
    return acc;
  }, {});

  const counts = {
    all: matches.filter((m) => !m.bye).length,
    completed: matches.filter((m) => getMatchStatus(m) === "completed").length,
    upcoming: matches.filter((m) => getMatchStatus(m) === "upcoming").length,
    "needs-score": matches.filter((m) => getMatchStatus(m) === "needs-score").length,
  };

  return (
    <section>
      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "completed", "upcoming", "needs-score"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f
                ? "bg-primary text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f === "all" ? "All" : f === "needs-score" ? "Needs Score" : f.charAt(0).toUpperCase() + f.slice(1)}{" "}
            ({counts[f]})
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {Object.entries(grouped)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([week, weekMatches]) => (
            <div key={week} className="bg-surface-alt rounded-xl border border-border overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-border">
                <span className="text-sm font-semibold">Week {week}</span>
              </div>
              <div className="divide-y divide-border">
                {weekMatches.map((m) => {
                  const status = getMatchStatus(m);
                  const winner = m.winner_participant_id;
                  const score = formatScore(m.score1_sets, m.score2_sets, winner, m.participant1_id);

                  return (
                    <Link
                      key={m.id}
                      href={`/tournament/${slug}/match/${m.id}`}
                      className="flex items-start justify-between gap-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-medium text-sm ${winner === m.participant1_id ? "text-accent font-bold" : ""}`}>
                            {m.p1_name}
                          </span>
                          <span className="text-slate-400 text-xs">vs</span>
                          <span className={`font-medium text-sm ${winner === m.participant2_id ? "text-accent font-bold" : ""}`}>
                            {m.p2_name}
                          </span>
                        </div>
                        {score && <p className="text-xs text-slate-500 mt-0.5">{score}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(m.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          {m.scheduled_time ? ` at ${m.scheduled_time}` : ""}
                          {m.court ? ` · ${m.court}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          status === "completed"
                            ? "bg-accent/10 text-accent"
                            : status === "needs-score"
                              ? "bg-danger/10 text-danger"
                              : "bg-warning/10 text-warning"
                        }`}>
                          {status === "needs-score" ? "Enter Score →" : status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        {Object.keys(grouped).length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No matches match the selected filter.</p>
        )}
      </div>
    </section>
  );
}
