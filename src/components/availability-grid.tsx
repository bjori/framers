"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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
  confirmed?: boolean;
}

interface Props {
  roster: { player_id: string; name: string }[];
  matches: Match[];
  availability: AvailabilityEntry[];
  neededPlayers?: number;
  currentPlayerId?: string | null;
  slug?: string;
}

const RSVP_OPTIONS: { value: "yes" | "maybe" | "no"; emoji: string; label: string; bg: string }[] = [
  { value: "yes", emoji: "\u2705", label: "Yes", bg: "bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/50 border-green-200 dark:border-green-800" },
  { value: "maybe", emoji: "\u2753", label: "Maybe", bg: "bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 border-yellow-200 dark:border-yellow-800" },
  { value: "no", emoji: "\u274C", label: "No", bg: "bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 border-red-200 dark:border-red-800" },
];

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

function RsvpPopover({
  matchId,
  matchDate,
  opponent,
  current,
  onSelect,
  onClose,
}: {
  matchId: string;
  matchDate: string;
  opponent: string;
  current: string | null;
  onSelect: (matchId: string, status: "yes" | "maybe" | "no") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const dateStr = new Date(matchDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-auto p-5 pb-8 sm:pb-5 shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        <div className="text-center mb-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{dateStr}</p>
          <p className="font-semibold text-sm">vs {opponent}</p>
        </div>
        <div className="flex gap-3">
          {RSVP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(matchId, opt.value)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 transition-all active:scale-95 ${opt.bg} ${
                current === opt.value ? "ring-2 ring-sky-400 ring-offset-2 dark:ring-offset-slate-800 scale-105" : ""
              }`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              <span className="text-xs font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
  const [popover, setPopover] = useState<{ matchId: string; matchDate: string; opponent: string } | null>(null);

  const displayNames = disambiguateNames(roster);

  const openMatches = matches.filter((m) => m.match_date >= new Date().toISOString().slice(0, 10));
  const displayMatches = openMatches.length > 0 ? openMatches : matches.slice(-5);

  const handleSelect = useCallback(async (matchId: string, status: "yes" | "maybe" | "no") => {
    if (!currentPlayerId || !slug) return;
    const key = `${currentPlayerId}:${matchId}`;
    const current = avMap.get(key) ?? null;

    setSubmitting(key);
    setAvMap((prev) => {
      const m = new Map(prev);
      m.set(key, status);
      return m;
    });
    setPopover(null);

    try {
      const res = await fetch(`/api/team/${slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status }),
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
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Tap your row to update</p>
      )}
      <div className="bg-surface-alt rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-slate-500 sticky left-0 bg-surface-alt z-10 min-w-[120px]">
                Player
              </th>
              {displayMatches.map((m) => {
                const confirmed = m.confirmed !== false;
                return (
                  <th
                    key={m.id}
                    className={`px-2 py-2 text-center font-medium min-w-[60px] ${
                      confirmed ? "text-slate-500" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    <div className="text-[10px] leading-tight">
                      {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                    <div className={`text-[9px] truncate max-w-[60px] ${confirmed ? "text-slate-400" : "text-slate-400/80"}`}>
                      {m.opponent_team.split(" ")[0]}
                      {!confirmed && " (TBD)"}
                    </div>
                  </th>
                );
              })}
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
                    const confirmed = m.confirmed !== false;
                    const canEdit = isMe && !!slug && isOpen(m.match_date) && confirmed;
                    return (
                      <td
                        key={m.id}
                        className={`px-2 py-1.5 text-center ${!confirmed ? "bg-slate-50/50 dark:bg-slate-900/20" : ""}`}
                      >
                        {canEdit ? (
                          <button
                            onClick={() => setPopover({ matchId: m.id, matchDate: m.match_date, opponent: m.opponent_team })}
                            disabled={submitting === key}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs transition-transform active:scale-95 ${statusColor(status)} ${submitting === key ? "opacity-50" : "hover:ring-2 hover:ring-sky-300 dark:hover:ring-sky-700 cursor-pointer"}`}
                          >
                            {statusIcon(status)}
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs ${statusColor(status)} ${!confirmed ? "opacity-60" : ""}`}
                            title={!confirmed ? "Date not confirmed yet" : undefined}
                          >
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
                const confirmed = m.confirmed !== false;
                const color = confirmed
                  ? yes >= neededPlayers ? "text-accent" : yes >= neededPlayers - 2 ? "text-warning" : "text-danger"
                  : "text-slate-400 dark:text-slate-500";
                return (
                  <td
                    key={m.id}
                    className={`px-2 py-1.5 text-center font-bold text-xs ${color} ${!confirmed ? "bg-slate-50/50 dark:bg-slate-900/20" : ""}`}
                  >
                    {confirmed ? `${yes}/${roster.length}` : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {popover && currentPlayerId && (
        <RsvpPopover
          matchId={popover.matchId}
          matchDate={popover.matchDate}
          opponent={popover.opponent}
          current={avMap.get(`${currentPlayerId}:${popover.matchId}`) ?? null}
          onSelect={handleSelect}
          onClose={() => setPopover(null)}
        />
      )}
    </section>
  );
}
