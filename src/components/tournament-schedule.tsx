"use client";

import { useState } from "react";

interface TournamentMatch {
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
  const matchDate = new Date(m.scheduled_date + "T" + (m.scheduled_time || "00:00"));
  if (matchDate < now) return "needs-score";
  return "upcoming";
}

function ScoreEntryForm({ match, slug, onClose }: { match: TournamentMatch; slug: string; onClose: () => void }) {
  const [sets, setSets] = useState([
    { p1: "", p2: "" },
    { p1: "", p2: "" },
    { p1: "", p2: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    const score1: number[] = [];
    const score2: number[] = [];
    let p1SetsWon = 0, p2SetsWon = 0;

    for (const set of sets) {
      if (set.p1 === "" && set.p2 === "") continue;
      const s1 = parseInt(set.p1), s2 = parseInt(set.p2);
      if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
        setError("Invalid score values");
        return;
      }
      score1.push(s1);
      score2.push(s2);
      if (s1 > s2) p1SetsWon++;
      else if (s2 > s1) p2SetsWon++;
    }

    if (score1.length < 2) {
      setError("Enter at least 2 sets");
      return;
    }

    const winnerId = p1SetsWon > p2SetsWon ? match.participant1_id : match.participant2_id;

    setSubmitting(true);
    const res = await fetch(`/api/tournament/${slug}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        score1Sets: score1,
        score2Sets: score2,
        winnerId,
      }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Failed to submit score");
      setSubmitting(false);
      return;
    }

    window.location.reload();
  }

  return (
    <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-border">
      <p className="text-xs font-semibold mb-2 text-slate-600 dark:text-slate-300">Enter Score</p>
      <div className="space-y-2">
        {sets.map((set, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-6">S{i + 1}</span>
            <input
              type="number"
              min="0"
              max="13"
              placeholder="0"
              value={set.p1}
              onChange={(e) => {
                const next = [...sets];
                next[i] = { ...next[i], p1: e.target.value };
                setSets(next);
              }}
              className="w-14 h-10 text-center rounded-lg border border-border bg-white dark:bg-slate-900 text-lg font-bold"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="number"
              min="0"
              max="13"
              placeholder="0"
              value={set.p2}
              onChange={(e) => {
                const next = [...sets];
                next[i] = { ...next[i], p2: e.target.value };
                setSets(next);
              }}
              className="w-14 h-10 text-center rounded-lg border border-border bg-white dark:bg-slate-900 text-lg font-bold"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
        <span>{match.p1_name} — {match.p2_name}</span>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 py-2 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Submit Score"}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-border text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TournamentSchedule({ matches, slug }: { matches: TournamentMatch[]; slug?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

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
      <h2 className="text-lg font-semibold mb-3">Schedule</h2>

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
                  const canEnterScore = status === "needs-score" || (status === "completed" && slug);

                  return (
                    <div key={m.id} className="px-4 py-3">
                      <div
                        className={`flex items-center justify-between gap-2 ${canEnterScore ? "cursor-pointer" : ""}`}
                        onClick={() => canEnterScore && slug ? setEditingMatchId(editingMatchId === m.id ? null : m.id) : undefined}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-medium ${winner === m.participant1_id ? "text-accent font-bold" : ""}`}>
                              {m.p1_name}
                            </span>
                            <span className="text-slate-400">vs</span>
                            <span className={`font-medium ${winner === m.participant2_id ? "text-accent font-bold" : ""}`}>
                              {m.p2_name}
                            </span>
                          </div>
                          {score && <p className="text-xs text-slate-500 mt-0.5">{score}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            status === "completed"
                              ? "bg-accent/10 text-accent"
                              : status === "needs-score"
                                ? "bg-danger/10 text-danger"
                                : "bg-warning/10 text-warning"
                          }`}>
                            {status === "needs-score" ? "Score?" : status}
                          </span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(m.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {m.court ? ` · ${m.court}` : ""}
                          </p>
                        </div>
                      </div>
                      {editingMatchId === m.id && slug && (
                        <ScoreEntryForm
                          match={m}
                          slug={slug}
                          onClose={() => setEditingMatchId(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
