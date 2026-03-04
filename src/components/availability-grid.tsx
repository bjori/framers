"use client";

import { useState, useCallback } from "react";

interface AvailabilityEntry {
  player_name: string;
  player_id: string;
  match_id: string;
  status: string | null;
}

interface Match {
  id: string;
  match_date: string;
  opponent_team: string;
}

interface Props {
  roster: { player_id: string; name: string }[];
  matches: Match[];
  availability: AvailabilityEntry[];
  neededPlayers?: number;
  currentPlayerId?: string | null;
  slug?: string;
}

function statusIcon(status: string | null): string {
  switch (status) {
    case "yes": return "\u2705";
    case "maybe": return "\u2753";
    case "no": return "\u274C";
    default: return "\u2014";
  }
}

function statusColor(status: string | null): string {
  switch (status) {
    case "yes": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
    case "maybe": return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
    case "no": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    default: return "bg-slate-50 dark:bg-slate-800/50 text-slate-400";
  }
}

function nextStatus(current: string | null): "yes" | "maybe" | "no" {
  switch (current) {
    case "yes": return "maybe";
    case "maybe": return "no";
    case "no": return "yes";
    default: return "yes";
  }
}

function disambiguateNames(roster: { player_id: string; name: string }[]): Map<string, string> {
  const firstNames = new Map<string, string[]>();
  for (const p of roster) {
    const first = p.name.split(" ")[0];
    const existing = firstNames.get(first) ?? [];
    existing.push(p.player_id);
    firstNames.set(first, existing);
  }

  const displayNames = new Map<string, string>();
  for (const p of roster) {
    const parts = p.name.split(" ");
    const first = parts[0];
    if ((firstNames.get(first)?.length ?? 0) > 1 && parts.length > 1) {
      displayNames.set(p.player_id, `${first} ${parts[parts.length - 1][0]}.`);
    } else {
      displayNames.set(p.player_id, first);
    }
  }
  return displayNames;
}

export default function AvailabilityGrid({ roster, matches, availability, neededPlayers = 7, currentPlayerId, slug }: Props) {
  const [avMap, setAvMap] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const a of availability) {
      m.set(`${a.player_id}:${a.match_id}`, a.status ?? "pending");
    }
    return m;
  });
  const [submitting, setSubmitting] = useState<string | null>(null);

  const displayNames = disambiguateNames(roster);

  const openMatches = matches.filter((m) => m.match_date >= new Date().toISOString().slice(0, 10));
  const displayMatches = openMatches.length > 0 ? openMatches : matches.slice(-5);

  const handleToggle = useCallback(async (matchId: string) => {
    if (!currentPlayerId || !slug) return;
    const key = `${currentPlayerId}:${matchId}`;
    const current = avMap.get(key) ?? null;
    const next = nextStatus(current);

    setSubmitting(key);
    setAvMap((prev) => {
      const m = new Map(prev);
      m.set(key, next);
      return m;
    });

    try {
      const res = await fetch(`/api/team/${slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status: next }),
      });
      if (!res.ok) {
        setAvMap((prev) => {
          const m = new Map(prev);
          if (current) m.set(key, current);
          else m.delete(key);
          return m;
        });
      }
    } catch {
      setAvMap((prev) => {
        const m = new Map(prev);
        if (current) m.set(key, current);
        else m.delete(key);
        return m;
      });
    }
    setSubmitting(null);
  }, [currentPlayerId, slug, avMap]);

  if (displayMatches.length === 0) return null;

  const yesCount = (matchId: string) => {
    let c = 0;
    for (const p of roster) {
      if (avMap.get(`${p.player_id}:${matchId}`) === "yes") c++;
    }
    return c;
  };

  const isOpen = (matchDate: string) => matchDate >= new Date().toISOString().slice(0, 10);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Availability</h2>
      {currentPlayerId && slug && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Tap your row to update your availability</p>
      )}
      <div className="bg-surface-alt rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-slate-500 sticky left-0 bg-surface-alt z-10 min-w-[120px]">
                Player
              </th>
              {displayMatches.map((m) => (
                <th key={m.id} className="px-2 py-2 text-center font-medium text-slate-500 min-w-[60px]">
                  <div className="text-[10px] leading-tight">
                    {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div className="text-[9px] text-slate-400 truncate max-w-[60px]">{m.opponent_team.split(" ")[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const isMe = p.player_id === currentPlayerId;
              return (
                <tr
                  key={p.player_id}
                  className={`border-b border-border last:border-0 ${isMe ? "bg-sky-50/50 dark:bg-sky-900/10" : ""}`}
                >
                  <td className={`px-3 py-1.5 font-medium text-xs sticky left-0 z-10 whitespace-nowrap ${isMe ? "bg-sky-50/50 dark:bg-sky-900/10" : "bg-surface-alt"}`}>
                    {displayNames.get(p.player_id)}
                    {isMe && <span className="ml-1 text-[9px] text-sky-500 font-bold">YOU</span>}
                  </td>
                  {displayMatches.map((m) => {
                    const key = `${p.player_id}:${m.id}`;
                    const status = avMap.get(key) ?? null;
                    const canEdit = isMe && slug && isOpen(m.match_date);
                    return (
                      <td key={m.id} className="px-2 py-1.5 text-center">
                        {canEdit ? (
                          <button
                            onClick={() => handleToggle(m.id)}
                            disabled={submitting === key}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs transition-transform active:scale-90 ${statusColor(status)} ${submitting === key ? "opacity-50" : "hover:ring-2 hover:ring-sky-300 dark:hover:ring-sky-700"}`}
                          >
                            {statusIcon(status)}
                          </button>
                        ) : (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs ${statusColor(status)}`}>
                            {statusIcon(status)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t-2 border-border">
              <td className="px-3 py-1.5 font-semibold text-xs sticky left-0 bg-surface-alt z-10">Available</td>
              {displayMatches.map((m) => {
                const yes = yesCount(m.id);
                const color = yes >= neededPlayers ? "text-accent" : yes >= neededPlayers - 2 ? "text-warning" : "text-danger";
                return (
                  <td key={m.id} className={`px-2 py-1.5 text-center font-bold text-xs ${color}`}>
                    {yes}/{roster.length}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
