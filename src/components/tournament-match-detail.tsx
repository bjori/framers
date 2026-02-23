"use client";

import { useState } from "react";

interface MatchData {
  id: string;
  participant1_id: string;
  participant2_id: string;
  winner_participant_id: string | null;
  score1_sets: string | null;
  score2_sets: string | null;
  scheduled_date: string;
  scheduled_time: string;
  court: string;
  status: string;
  p1_name: string;
  p2_name: string;
  p1_player_id: string;
  p2_player_id: string;
  p1_email?: string;
  p1_phone?: string | null;
  p2_email?: string;
  p2_phone?: string | null;
}

function parseScore(s: string | null): number[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

export function TournamentMatchDetail({ match, slug }: { match: MatchData; slug: string }) {
  const existing1 = parseScore(match.score1_sets);
  const existing2 = parseScore(match.score2_sets);
  const hasExisting = existing1.length > 0;
  const isCompleted = match.status === "completed";

  const [tab, setTab] = useState<"score" | "reschedule" | null>(null);
  const [winnerId, setWinnerId] = useState(match.winner_participant_id || "");
  const [sets, setSets] = useState(() => {
    if (!hasExisting) return [{ w: "", l: "" }, { w: "", l: "" }, { w: "", l: "" }];
    const isP1Winner = match.winner_participant_id === match.participant1_id;
    const wScores = isP1Winner ? existing1 : existing2;
    const lScores = isP1Winner ? existing2 : existing1;
    const rows = wScores.map((g, i) => ({ w: String(g), l: String(lScores[i] ?? 0) }));
    if (rows.length < 3) rows.push({ w: "", l: "" });
    return rows;
  });
  const [isForfeit, setIsForfeit] = useState(false);
  const [forfeitBy, setForfeitBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [date, setDate] = useState(match.scheduled_date);
  const [time, setTime] = useState(match.scheduled_time || "");
  const [court, setCourt] = useState(match.court || "");

  const winnerName = winnerId === match.participant1_id ? match.p1_name : winnerId === match.participant2_id ? match.p2_name : "";

  async function submitScore() {
    setError("");
    if (isForfeit) {
      if (!forfeitBy) { setError("Select who forfeited"); return; }
      const fWinnerId = forfeitBy === match.participant1_id ? match.participant2_id : match.participant1_id;
      setSubmitting(true);
      const isP1Winner = fWinnerId === match.participant1_id;
      const res = await fetch(`/api/tournament/${slug}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          score1Sets: isP1Winner ? [6, 6] : [0, 0],
          score2Sets: isP1Winner ? [0, 0] : [6, 6],
          winnerId: fWinnerId,
          isForfeit: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to submit");
        setSubmitting(false);
        return;
      }
      setSuccess("Score recorded!");
      setTimeout(() => window.location.reload(), 1200);
      return;
    }

    if (!winnerId) { setError("Select who won the match"); return; }

    const winnerSets: number[] = [];
    const loserSets: number[] = [];
    for (const set of sets) {
      if (set.w === "" && set.l === "") continue;
      const w = parseInt(set.w), l = parseInt(set.l);
      if (isNaN(w) || isNaN(l) || w < 0 || l < 0) { setError("Invalid score values"); return; }
      winnerSets.push(w);
      loserSets.push(l);
    }
    if (winnerSets.length < 2) { setError("Enter at least 2 sets"); return; }

    const isP1Winner = winnerId === match.participant1_id;

    setSubmitting(true);
    const res = await fetch(`/api/tournament/${slug}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        score1Sets: isP1Winner ? winnerSets : loserSets,
        score2Sets: isP1Winner ? loserSets : winnerSets,
        winnerId,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Failed to submit score");
      setSubmitting(false);
      return;
    }
    setSuccess("Score saved!");
    setTimeout(() => window.location.reload(), 1200);
  }

  async function submitReschedule() {
    if (!date) { setError("Date is required"); return; }
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/tournament/${slug}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, scheduledDate: date, scheduledTime: time, court: court || undefined }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Failed to reschedule");
      setSubmitting(false);
      return;
    }
    setSuccess("Match rescheduled!");
    setTimeout(() => window.location.reload(), 1200);
  }

  if (success) {
    return (
      <div className="bg-accent/10 border border-accent/30 rounded-xl p-6 text-center animate-[fadeIn_0.3s_ease-out]">
        <p className="text-2xl mb-2">\u2713</p>
        <p className="font-semibold text-accent">{success}</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => setTab(tab === "score" ? null : "score")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            tab === "score" ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          {isCompleted ? "Edit Score" : "Enter Score"}
        </button>
        {!isCompleted && (
          <button
            onClick={() => setTab(tab === "reschedule" ? null : "reschedule")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === "reschedule" ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            Reschedule
          </button>
        )}
      </div>

      {tab === "score" && (
        <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">{hasExisting ? "Edit Score" : "Enter Score"}</h3>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={isForfeit} onChange={(e) => setIsForfeit(e.target.checked)} className="rounded" />
              Forfeit / No-show
            </label>
          </div>

          {isForfeit ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">Who forfeited?</p>
              <div className="flex gap-2">
                {[
                  { id: match.participant1_id, name: match.p1_name },
                  { id: match.participant2_id, name: match.p2_name },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setForfeitBy(p.id)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      forfeitBy === p.id ? "border-danger bg-danger/10 text-danger" : "border-border hover:border-slate-400"
                    }`}
                  >{p.name}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Who won?</p>
                <div className="flex gap-2">
                  {[
                    { id: match.participant1_id, name: match.p1_name },
                    { id: match.participant2_id, name: match.p2_name },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setWinnerId(p.id)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                        winnerId === p.id
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border hover:border-slate-400"
                      }`}
                    >{p.name}</button>
                  ))}
                </div>
              </div>

              {winnerId && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Score (from {winnerName.split("/")[0].trim()}&apos;s perspective)
                  </p>
                  <div className="space-y-2">
                    {sets.map((set, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-5 text-right">S{i + 1}</span>
                        <input
                          type="number" min="0" max="13" placeholder="W" value={set.w}
                          onChange={(e) => { const next = [...sets]; next[i] = { ...next[i], w: e.target.value }; setSets(next); }}
                          className="w-16 h-10 text-center rounded-lg border border-accent/40 bg-accent/5 dark:bg-accent/10 text-lg font-bold"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <input
                          type="number" min="0" max="13" placeholder="L" value={set.l}
                          onChange={(e) => { const next = [...sets]; next[i] = { ...next[i], l: e.target.value }; setSets(next); }}
                          className="w-16 h-10 text-center rounded-lg border border-border bg-white dark:bg-slate-900 text-lg font-bold"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Winner&apos;s games on the left. Leave Set 3 blank for straight sets.</p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            onClick={submitScore}
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {submitting ? "Saving..." : isForfeit ? "Record Forfeit" : "Submit Score"}
          </button>
        </div>
      )}

      {tab === "reschedule" && (
        <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3 animate-[fadeIn_0.2s_ease-out]">
          <h3 className="font-semibold text-sm">Reschedule Match</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Court</label>
            <input type="text" value={court} onChange={(e) => setCourt(e.target.value)} placeholder="e.g. Court 3"
              className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm" />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            onClick={submitReschedule}
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {submitting ? "Saving..." : "Update Schedule"}
          </button>
        </div>
      )}
    </section>
  );
}
