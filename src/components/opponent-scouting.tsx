"use client";

import { useState, useEffect } from "react";

interface ScoutPlayer {
  player_name: string;
  tr_rating: number | null;
  tr_dynamic_rating: number | null;
  season_record: string | null;
  current_streak: string | null;
  avg_opponent_rating: number | null;
  win_pct: number | null;
  ntrp: string | null;
}

interface HeadToHeadEntry {
  ourPlayer: string;
  opponent: string;
  result: string;
  score: string;
  date: string;
}

interface PredictionData {
  linePredictions: { position: string; ourPlayer: string; ourRating: number; oppPlayer: string; oppRating: number; winProbability: number }[];
  expectedScore: number;
  predictedResult: string;
}

interface ScoutReport {
  teamName: string;
  players: ScoutPlayer[];
  headToHead: HeadToHeadEntry[];
  prediction: PredictionData | null;
  fromCache: boolean;
}

export function OpponentScouting({ opponentTeam, ourTeamSlug }: { opponentTeam: string; ourTeamSlug: string }) {
  const [report, setReport] = useState<ScoutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/match-scouting?opponent=${encodeURIComponent(opponentTeam)}&team=${encodeURIComponent(ourTeamSlug)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load scouting data");
        return (await r.json()) as ScoutReport;
      })
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [opponentTeam, ourTeamSlug]);

  if (loading) return <div className="text-sm text-slate-400 animate-pulse">Loading opponent scouting...</div>;
  if (error || !report || report.players.length === 0) return null;

  const bestRating = Math.max(...report.players.map((p) => p.tr_dynamic_rating ?? p.tr_rating ?? 0));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Opponent Scouting</h2>
        <a
          href={`https://www.tennisrecord.com/adult/teamprofile.aspx?year=2026&teamname=${encodeURIComponent(opponentTeam)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-sky-600 hover:text-sky-500 flex items-center gap-1"
        >
          TennisRecord
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>

      {report.prediction && (
        <div className="bg-surface-alt rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Predicted Outcome</span>
            <span className="text-lg font-bold">{report.prediction.predictedResult}</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all"
              style={{ width: `${(report.prediction.expectedScore / 6) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-slate-400">
            <span>Us</span>
            <span>Expected: {report.prediction.expectedScore} pts</span>
            <span>Them</span>
          </div>
        </div>
      )}

      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              <th className="px-4 py-2">Player</th>
              <th className="px-3 py-2 text-center">Rating</th>
              <th className="px-3 py-2 text-center">Record</th>
              <th className="px-3 py-2 text-center">Streak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.players
              .sort((a, b) => (b.tr_dynamic_rating ?? b.tr_rating ?? 0) - (a.tr_dynamic_rating ?? a.tr_rating ?? 0))
              .map((p) => {
                const rating = p.tr_dynamic_rating ?? p.tr_rating;
                const isBest = rating === bestRating && bestRating > 0;
                return (
                  <tr key={p.player_name} className="hover:bg-surface/50">
                    <td className="px-4 py-2.5">
                      <a
                        href={`https://www.tennisrecord.com/adult/profile.aspx?playername=${encodeURIComponent(p.player_name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary-light hover:underline"
                      >
                        {p.player_name}
                      </a>
                      {isBest && <span className="ml-1 text-[10px] text-amber-500 font-bold">TOP</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-xs">
                      {rating?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {p.season_record ?? "—"}
                      {p.win_pct != null && <span className="text-slate-400 ml-1">({p.win_pct}%)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {p.current_streak ? (
                        <span className={`text-xs font-bold ${p.current_streak.startsWith("W") ? "text-accent" : "text-danger"}`}>
                          {p.current_streak}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {report.headToHead.length > 0 && (
        <div className="bg-surface-alt rounded-xl border border-border p-4">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Head-to-Head History</h3>
          <div className="space-y-1.5">
            {report.headToHead.slice(0, 8).map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium">{h.ourPlayer}</span>
                  <span className="text-slate-400 mx-1">vs</span>
                  <span className="font-medium">{h.opponent}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${h.result === "W" ? "text-accent" : "text-danger"}`}>
                    {h.result}
                  </span>
                  <span className="text-slate-400">{h.score}</span>
                  <span className="text-slate-400">{h.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
