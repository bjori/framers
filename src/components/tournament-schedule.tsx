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
  p1_email?: string;
  p1_phone?: string | null;
  p2_email?: string;
  p2_phone?: string | null;
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

function ContactInfo({ name, email, phone, playerId }: { name: string; email?: string; phone?: string | null; playerId: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href={`/player/${playerId}`} className="font-medium text-sky-700 dark:text-sky-400 hover:underline">{name}</Link>
      {phone && (
        <a href={`tel:${phone}`} className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400" title={`Call ${phone}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400" title={`Email ${email}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        </a>
      )}
    </div>
  );
}

function ScoreEntryForm({ match, slug, onClose }: { match: TournamentMatch; slug: string; onClose: () => void }) {
  const existing1 = parseScore(match.score1_sets);
  const existing2 = parseScore(match.score2_sets);
  const hasExisting = existing1.length > 0;

  const existingWinner = match.winner_participant_id;
  const [winnerId, setWinnerId] = useState<string>(existingWinner || "");

  // Pre-populate scores from winner's perspective
  const [sets, setSets] = useState(() => {
    if (!hasExisting) return [{ w: "", l: "" }, { w: "", l: "" }, { w: "", l: "" }];
    const isP1Winner = existingWinner === match.participant1_id;
    const wScores = isP1Winner ? existing1 : existing2;
    const lScores = isP1Winner ? existing2 : existing1;
    const rows = wScores.map((g, i) => ({ w: String(g), l: String(lScores[i] ?? 0) }));
    if (rows.length < 3) rows.push({ w: "", l: "" });
    return rows;
  });
  const [isForfeit, setIsForfeit] = useState(false);
  const [forfeitBy, setForfeitBy] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const winnerName = winnerId === match.participant1_id ? match.p1_name : winnerId === match.participant2_id ? match.p2_name : "";

  async function handleSubmit() {
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
      window.location.reload();
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

    // Map back to p1/p2 orientation for storage
    const isP1Winner = winnerId === match.participant1_id;
    const score1Sets = isP1Winner ? winnerSets : loserSets;
    const score2Sets = isP1Winner ? loserSets : winnerSets;

    setSubmitting(true);
    const res = await fetch(`/api/tournament/${slug}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.id, score1Sets, score2Sets, winnerId }),
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
    <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
          {hasExisting ? "Edit Score" : "Enter Score"}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={isForfeit} onChange={(e) => setIsForfeit(e.target.checked)} className="rounded" />
          Forfeit / No-show
        </label>
      </div>

      {isForfeit ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">Who forfeited?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setForfeitBy(match.participant1_id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                forfeitBy === match.participant1_id ? "border-danger bg-danger/10 text-danger" : "border-border hover:border-slate-400"
              }`}
            >{match.p1_name}</button>
            <button
              onClick={() => setForfeitBy(match.participant2_id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                forfeitBy === match.participant2_id ? "border-danger bg-danger/10 text-danger" : "border-border hover:border-slate-400"
              }`}
            >{match.p2_name}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Step 1: Pick the winner */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Who won?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setWinnerId(match.participant1_id)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  winnerId === match.participant1_id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:border-slate-400"
                }`}
              >{match.p1_name}</button>
              <button
                onClick={() => setWinnerId(match.participant2_id)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  winnerId === match.participant2_id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:border-slate-400"
                }`}
              >{match.p2_name}</button>
            </div>
          </div>

          {/* Step 2: Enter score from winner's perspective */}
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
        </div>
      )}

      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit} disabled={submitting}
          className="flex-1 py-2 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50"
        >{submitting ? "Saving..." : isForfeit ? "Record Forfeit" : "Submit Score"}</button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
      </div>
    </div>
  );
}

function RescheduleForm({ match, slug, onClose }: { match: TournamentMatch; slug: string; onClose: () => void }) {
  const [date, setDate] = useState(match.scheduled_date);
  const [time, setTime] = useState(match.scheduled_time || "");
  const [court, setCourt] = useState(match.court || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
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
    window.location.reload();
  }

  return (
    <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-border">
      <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-3">Reschedule Match</p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Time</label>
            <input
              type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Court (optional)</label>
          <input
            type="text" value={court} onChange={(e) => setCourt(e.target.value)} placeholder="e.g. Court 3"
            className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm"
          />
        </div>

        {/* Contact opponent */}
        <div className="bg-white dark:bg-slate-900/50 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Contact opponent to confirm</p>
          <div className="space-y-1.5">
            <ContactInfo name={match.p1_name} email={match.p1_email} phone={match.p1_phone} playerId={match.p1_player_id} />
            <ContactInfo name={match.p2_name} email={match.p2_email} phone={match.p2_phone} playerId={match.p2_player_id} />
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSubmit} disabled={submitting}
          className="flex-1 py-2 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50"
        >{submitting ? "Saving..." : "Update Schedule"}</button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
      </div>
    </div>
  );
}

export function TournamentSchedule({ matches, slug }: { matches: TournamentMatch[]; slug?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [activePanel, setActivePanel] = useState<{ matchId: string; panel: "score" | "reschedule" } | null>(null);

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

  function togglePanel(matchId: string, panel: "score" | "reschedule") {
    setActivePanel(
      activePanel?.matchId === matchId && activePanel.panel === panel
        ? null
        : { matchId, panel }
    );
  }

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
                  const isActive = activePanel?.matchId === m.id;
                  const canScore = slug && (status === "needs-score" || status === "completed" || status === "upcoming");
                  const canReschedule = slug && status !== "completed";

                  return (
                    <div key={m.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
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
                            {status === "needs-score" ? "Score?" : status}
                          </span>
                          {slug && (
                            <div className="flex gap-1">
                              {canScore && (
                                <button
                                  onClick={() => togglePanel(m.id, "score")}
                                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                                    isActive && activePanel?.panel === "score"
                                      ? "bg-primary text-white"
                                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                                  }`}
                                >
                                  {status === "completed" ? "Edit" : "Score"}
                                </button>
                              )}
                              {canReschedule && (
                                <button
                                  onClick={() => togglePanel(m.id, "reschedule")}
                                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                                    isActive && activePanel?.panel === "reschedule"
                                      ? "bg-primary text-white"
                                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                                  }`}
                                >
                                  Reschedule
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {isActive && activePanel?.panel === "score" && slug && (
                        <ScoreEntryForm match={m} slug={slug} onClose={() => setActivePanel(null)} />
                      )}
                      {isActive && activePanel?.panel === "reschedule" && slug && (
                        <RescheduleForm match={m} slug={slug} onClose={() => setActivePanel(null)} />
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
