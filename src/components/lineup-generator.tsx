"use client";

import { useState } from "react";

interface LineupSlot {
  position: string;
  playerId: string;
  playerName: string;
  score: number;
}

interface BenchPlayer {
  id: string;
  name: string;
  singlesElo: number;
  doublesElo?: number;
}

interface LineupResult {
  slots: LineupSlot[];
  unassigned: BenchPlayer[];
  alternates: BenchPlayer[];
}

export function LineupGenerator({ slug, matchId }: { slug: string; matchId: string }) {
  const [lineup, setLineup] = useState<LineupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  async function generateLineup() {
    setLoading(true);
    setMessage("");
    setSelectedIdx(null);
    const res = await fetch(`/api/team/${slug}/lineup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, action: "generate" }),
    });
    if (res.ok) {
      const data = (await res.json()) as { lineup: LineupResult };
      setLineup(data.lineup);
    } else {
      const err = (await res.json()) as { error?: string };
      setMessage(err.error || "Failed to generate lineup");
    }
    setLoading(false);
  }

  async function saveLineup(confirm: boolean) {
    if (!lineup) return;
    setSaving(true);
    const res = await fetch(`/api/team/${slug}/lineup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        action: confirm ? "confirm" : "save",
        slots: lineup.slots.map((s) => ({ position: s.position, playerId: s.playerId })),
      }),
    });
    if (res.ok) {
      setMessage(confirm ? "Lineup confirmed!" : "Lineup saved as draft");
      window.location.reload();
    } else {
      setMessage("Failed to save lineup");
    }
    setSaving(false);
  }

  function swapSlots(i: number, j: number) {
    if (!lineup || i === j) return;
    const next = { ...lineup, slots: [...lineup.slots] };
    const a = next.slots[i];
    const b = next.slots[j];
    next.slots[i] = { ...a, playerId: b.playerId, playerName: b.playerName, score: b.score };
    next.slots[j] = { ...b, playerId: a.playerId, playerName: a.playerName, score: a.score };
    setLineup(next);
    setSelectedIdx(null);
  }

  function subInAlternate(benchPlayer: BenchPlayer, targetIdx: number) {
    if (!lineup) return;
    const slot = lineup.slots[targetIdx];
    const evictedPlayer: BenchPlayer = {
      id: slot.playerId,
      name: slot.playerName,
      singlesElo: slot.score,
    };

    const isDoublesSlot = slot.position.startsWith("D");
    const next = {
      ...lineup,
      slots: lineup.slots.map((s, i) =>
        i === targetIdx
          ? { ...s, playerId: benchPlayer.id, playerName: benchPlayer.name, score: isDoublesSlot ? (benchPlayer.doublesElo ?? benchPlayer.singlesElo) : benchPlayer.singlesElo }
          : s
      ),
      alternates: [
        ...lineup.alternates.filter((a) => a.id !== benchPlayer.id),
        evictedPlayer,
      ],
      unassigned: [
        ...lineup.unassigned.filter((a) => a.id !== benchPlayer.id),
        evictedPlayer,
      ],
    };
    setLineup(next);
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

  const positionLabels: Record<string, string> = {
    S1: "Singles 1", S2: "Singles 2",
    D1A: "Doubles 1", D1B: "Doubles 1",
    D2A: "Doubles 2", D2B: "Doubles 2",
    D3A: "Doubles 3", D3B: "Doubles 3",
  };

  function groupedSlots() {
    if (!lineup) return [];
    const groups: { label: string; key: string; slots: { slot: LineupSlot; idx: number }[] }[] = [];
    let currentGroup = "";
    for (let i = 0; i < lineup.slots.length; i++) {
      const s = lineup.slots[i];
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
        <h2 className="text-lg font-semibold">Lineup</h2>
        <button
          onClick={generateLineup}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
        >
          {loading ? "Generating..." : lineup ? "Regenerate" : "Generate Lineup"}
        </button>
      </div>

      {message && <p className="text-sm text-primary-light">{message}</p>}

      {lineup && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedIdx !== null ? (
              <span className="text-sky-600 dark:text-sky-400 animate-pulse font-medium">
                Tap another position to swap, or tap a bench player to sub in
              </span>
            ) : (
              "Tap a player to select, then tap another to swap positions"
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
                  return (
                    <div
                      key={slot.position}
                      onClick={() => handleSlotTap(idx)}
                      className={`flex items-center justify-between px-4 py-3.5 cursor-pointer select-none transition-all border-b border-border last:border-b-0 ${
                        isSelected
                          ? "bg-sky-50 dark:bg-sky-900/30 ring-2 ring-inset ring-sky-400"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-700/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 w-8">
                          {slot.position}
                        </span>
                        <span className={`font-medium text-sm ${isSelected ? "text-sky-700 dark:text-sky-300" : "text-slate-900 dark:text-white"}`}>
                          {slot.playerName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 font-mono">{slot.score}</span>
                        {idx > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); swapSlots(idx, idx - 1); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                        )}
                        {lineup && idx < lineup.slots.length - 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); swapSlots(idx, idx + 1); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200 active:bg-slate-300 dark:active:bg-slate-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Bench / Alternates */}
            {lineup.alternates.length > 0 && (
              <div className="border-t-2 border-dashed border-slate-300 dark:border-slate-600">
                <div className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Bench
                  </span>
                </div>
                {lineup.alternates.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      if (selectedIdx !== null) subInAlternate(a, selectedIdx);
                    }}
                    className={`flex items-center justify-between px-4 py-3.5 border-b border-border last:border-b-0 transition-colors ${
                      selectedIdx !== null
                        ? "cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20 active:bg-sky-100 dark:active:bg-sky-900/40"
                        : "opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8" />
                      <span className="text-sm text-slate-600 dark:text-slate-300">{a.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono">{a.singlesElo}<span className="text-slate-300 dark:text-slate-600">/</span>{a.doublesElo ?? a.singlesElo}</span>
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

            {/* Action buttons */}
            <div className="flex gap-2 p-4 border-t border-border bg-white dark:bg-slate-900">
              <button
                onClick={() => saveLineup(false)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Save Draft
              </button>
              <button
                onClick={() => saveLineup(true)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:bg-green-600 transition-colors"
              >
                Confirm &amp; Notify
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
