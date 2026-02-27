"use client";

import { useState } from "react";

interface EditableSlot {
  position: string;
  playerId: string | null;
  playerName: string | null;
  singlesElo: number;
  doublesElo: number;
}

interface PoolPlayer {
  id: string;
  name: string;
  singlesElo: number;
  doublesElo: number;
  rsvpStatus: string | null;
}

interface Props {
  slug: string;
  matchId: string;
  slots: EditableSlot[];
  poolPlayers: PoolPlayer[];
}

function sortPool(players: PoolPlayer[]): PoolPlayer[] {
  return [...players].sort((a, b) => {
    const rsvpOrder = (s: string | null) =>
      s === "yes" ? 0 : s === "maybe" ? 1 : s === "no" ? 3 : 2;
    const diff = rsvpOrder(a.rsvpStatus) - rsvpOrder(b.rsvpStatus);
    return diff !== 0 ? diff : b.singlesElo - a.singlesElo;
  });
}

export function LineupEditor({
  slug,
  matchId,
  slots: initialSlots,
  poolPlayers: initialPool,
}: Props) {
  const [slots, setSlots] = useState<EditableSlot[]>(initialSlots);
  const [pool, setPool] = useState<PoolPlayer[]>(initialPool);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  // Stable map of all known players for pool reconstruction after regenerate
  const [allPlayersMap] = useState(() => {
    const map = new Map<string, PoolPlayer>();
    initialPool.forEach((p) => map.set(p.id, p));
    initialSlots
      .filter((s) => s.playerId)
      .forEach((s) => {
        if (!map.has(s.playerId!)) {
          map.set(s.playerId!, {
            id: s.playerId!,
            name: s.playerName!,
            singlesElo: s.singlesElo,
            doublesElo: s.doublesElo,
            rsvpStatus: null,
          });
        }
      });
    return map;
  });

  const hasVacant = slots.some((s) => !s.playerId);

  function swapSlots(i: number, j: number) {
    if (i === j) return;
    const next = [...slots];
    const [a, b] = [next[i], next[j]];
    next[i] = {
      ...next[i],
      playerId: b.playerId,
      playerName: b.playerName,
      singlesElo: b.singlesElo,
      doublesElo: b.doublesElo,
    };
    next[j] = {
      ...next[j],
      playerId: a.playerId,
      playerName: a.playerName,
      singlesElo: a.singlesElo,
      doublesElo: a.doublesElo,
    };
    setSlots(next);
    setSelectedIdx(null);
  }

  function subIn(player: PoolPlayer, slotIdx: number) {
    const slot = slots[slotIdx];
    let newPool = pool.filter((p) => p.id !== player.id);
    if (slot.playerId) {
      newPool.push({
        id: slot.playerId,
        name: slot.playerName!,
        singlesElo: slot.singlesElo,
        doublesElo: slot.doublesElo,
        rsvpStatus: allPlayersMap.get(slot.playerId)?.rsvpStatus ?? null,
      });
    }

    setSlots((prev) =>
      prev.map((s, i) =>
        i === slotIdx
          ? {
              ...s,
              playerId: player.id,
              playerName: player.name,
              singlesElo: player.singlesElo,
              doublesElo: player.doublesElo,
            }
          : s
      )
    );
    setPool(sortPool(newPool));
    setSelectedIdx(null);
  }

  function removeFromLineup(slotIdx: number) {
    const slot = slots[slotIdx];
    if (!slot.playerId) return;
    setPool((prev) =>
      sortPool([
        ...prev,
        {
          id: slot.playerId!,
          name: slot.playerName!,
          singlesElo: slot.singlesElo,
          doublesElo: slot.doublesElo,
          rsvpStatus: allPlayersMap.get(slot.playerId!)?.rsvpStatus ?? null,
        },
      ])
    );
    setSlots((prev) =>
      prev.map((s, i) =>
        i === slotIdx
          ? { ...s, playerId: null, playerName: null, singlesElo: 0, doublesElo: 0 }
          : s
      )
    );
    setSelectedIdx(null);
  }

  function handleSlotTap(idx: number) {
    if (selectedIdx === null) {
      setSelectedIdx(idx);
    } else if (selectedIdx === idx) {
      setSelectedIdx(null);
    } else {
      swapSlots(selectedIdx, idx);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setMessage("");
    setSelectedIdx(null);
    try {
      const res = await fetch(`/api/team/${slug}/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "generate" }),
      });
      if (!res.ok) {
        setMessage("Failed to generate lineup");
        return;
      }
      const data = (await res.json()) as {
        lineup: {
          slots: { position: string; playerId: string; playerName: string; score: number }[];
        };
      };
      const optimizerSlots = data.lineup.slots;

      const newSlots: EditableSlot[] = slots.map((currentSlot) => {
        const match = optimizerSlots.find((s) => s.position === currentSlot.position);
        if (match) {
          const full = allPlayersMap.get(match.playerId);
          return {
            position: currentSlot.position,
            playerId: match.playerId,
            playerName: match.playerName,
            singlesElo: full?.singlesElo ?? match.score,
            doublesElo: full?.doublesElo ?? match.score,
          };
        }
        return { ...currentSlot, playerId: null, playerName: null, singlesElo: 0, doublesElo: 0 };
      });

      const newStarterIds = new Set(
        newSlots.filter((s) => s.playerId).map((s) => s.playerId)
      );
      const newPool = sortPool(
        Array.from(allPlayersMap.values()).filter((p) => !newStarterIds.has(p.id))
      );

      setSlots(newSlots);
      setPool(newPool);
    } finally {
      setRegenerating(false);
    }
  }

  async function save(confirm: boolean) {
    if (hasVacant) return;
    setSaving(true);
    setMessage("");
    const res = await fetch(`/api/team/${slug}/lineup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        action: confirm ? "confirm" : "save",
        slots: slots.map((s) => ({ position: s.position, playerId: s.playerId })),
      }),
    });
    if (res.ok) {
      setMessage(confirm ? "Lineup confirmed & notifications sent!" : "Lineup saved as draft");
      window.location.reload();
    } else {
      setMessage("Failed to save lineup");
    }
    setSaving(false);
  }

  const positionLabels: Record<string, string> = {
    S1: "Singles 1",
    S2: "Singles 2",
    D1A: "Doubles 1",
    D1B: "Doubles 1",
    D2A: "Doubles 2",
    D2B: "Doubles 2",
    D3A: "Doubles 3",
    D3B: "Doubles 3",
  };

  function groupedSlots() {
    const groups: {
      label: string;
      key: string;
      slots: { slot: EditableSlot; idx: number }[];
    }[] = [];
    let currentGroup = "";
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const label = positionLabels[s.position] ?? s.position;
      if (label !== currentGroup) {
        currentGroup = label;
        groups.push({ label, key: s.position, slots: [] });
      }
      groups[groups.length - 1].slots.push({ slot: s, idx: i });
    }
    return groups;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Edit Lineup</h2>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-semibold disabled:opacity-50 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
        >
          {regenerating ? "Generating..." : "Regenerate"}
        </button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {hasVacant ? (
          <span className="text-danger font-medium">
            Select a vacant position, then pick a player from the pool below
          </span>
        ) : selectedIdx !== null ? (
          <span className="text-sky-600 dark:text-sky-400 animate-pulse font-medium">
            Tap another position to swap, or pick a player from the pool below
          </span>
        ) : (
          "Tap a position to select it, then swap or substitute"
        )}
      </p>

      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        {groupedSlots().map((group) => (
          <div key={group.key}>
            <div className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800/70 border-b border-border">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {group.label}
              </span>
            </div>
            {group.slots.map(({ slot, idx }) => {
              const isSelected = selectedIdx === idx;
              const isVacant = !slot.playerId;
              return (
                <div
                  key={slot.position}
                  onClick={() => handleSlotTap(idx)}
                  className={`flex items-center justify-between px-4 py-3.5 cursor-pointer select-none transition-all border-b border-border last:border-b-0 ${
                    isSelected
                      ? "bg-sky-50 dark:bg-sky-900/30 ring-2 ring-inset ring-sky-400"
                      : isVacant
                        ? "bg-red-50/50 dark:bg-red-900/10 border-l-2 border-l-danger"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-700/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 w-8">
                      {slot.position}
                    </span>
                    {isVacant ? (
                      <span className="text-sm font-medium text-danger/70 italic">
                        Needs player
                      </span>
                    ) : (
                      <span
                        className={`font-medium text-sm ${isSelected ? "text-sky-700 dark:text-sky-300" : "text-slate-900 dark:text-white"}`}
                      >
                        {slot.playerName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!isVacant && (
                      <span className="text-xs text-slate-400 font-mono">
                        {slot.position.startsWith("D") ? slot.doublesElo : slot.singlesElo}
                      </span>
                    )}
                    {isSelected && !isVacant && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromLineup(idx);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
                        title="Remove from lineup"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                    {idx > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          swapSlots(idx, idx - 1);
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
                        </svg>
                      </button>
                    )}
                    {idx < slots.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          swapSlots(idx, idx + 1);
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 p-4 border-t border-border bg-white dark:bg-slate-900">
          {hasVacant && (
            <p className="text-xs text-danger text-center">
              Fill all positions before saving
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => save(false)}
              disabled={saving || hasVacant}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving || hasVacant}
              className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:bg-green-600 transition-colors"
            >
              Confirm &amp; Notify
            </button>
          </div>
        </div>
      </div>

      {message && <p className="text-sm text-primary-light font-medium">{message}</p>}

      {/* Available Players Pool */}
      <div>
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">
          Available Players
          <span className="text-xs font-normal text-slate-400 ml-1">({pool.length})</span>
        </h3>
        {pool.length === 0 ? (
          <p className="text-sm text-slate-400 italic">All team members are in the lineup</p>
        ) : (
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {pool.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  if (selectedIdx !== null) subIn(p, selectedIdx);
                }}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  selectedIdx !== null
                    ? "cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20 active:bg-sky-100 dark:active:bg-sky-900/40"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.rsvpStatus === "yes"
                        ? "bg-accent"
                        : p.rsvpStatus === "maybe"
                          ? "bg-warning"
                          : p.rsvpStatus === "no"
                            ? "bg-danger"
                            : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">{p.singlesElo}</span>
                  {p.rsvpStatus && (
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        p.rsvpStatus === "yes"
                          ? "bg-accent/10 text-accent"
                          : p.rsvpStatus === "maybe"
                            ? "bg-warning/10 text-warning"
                            : p.rsvpStatus === "no"
                              ? "bg-danger/10 text-danger"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      {p.rsvpStatus}
                    </span>
                  )}
                  {selectedIdx !== null && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                      Sub In
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
