"use client";

import { useState } from "react";
import Link from "next/link";

interface EditableSlot {
  position: string;
  playerId: string | null;
  playerName: string | null;
  singlesElo: number;
  doublesElo: number;
  acknowledged: number | null;
  withdrawnName: string | null;
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
  lineupStatus: string;
}

function sortPool(players: PoolPlayer[]): PoolPlayer[] {
  return [...players].sort((a, b) => {
    const rsvpOrder = (s: string | null) =>
      s === "yes" ? 0 : s === "maybe" ? 1 : s === "no" ? 3 : 2;
    const diff = rsvpOrder(a.rsvpStatus) - rsvpOrder(b.rsvpStatus);
    return diff !== 0 ? diff : b.singlesElo - a.singlesElo;
  });
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

function groupSlots<T extends { position: string }>(items: T[]) {
  const groups: { label: string; key: string; items: { item: T; idx: number }[] }[] = [];
  let currentGroup = "";
  for (let i = 0; i < items.length; i++) {
    const label = positionLabels[items[i].position] ?? items[i].position;
    if (label !== currentGroup) {
      currentGroup = label;
      groups.push({ label, key: items[i].position, items: [] });
    }
    groups[groups.length - 1].items.push({ item: items[i], idx: i });
  }
  return groups;
}

function AckBadge({ value }: { value: number | null }) {
  if (value === 1)
    return <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent/10 text-accent">Confirmed</span>;
  if (value === 0)
    return <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-danger/10 text-danger">Declined</span>;
  return <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending</span>;
}

export function LineupEditor({
  slug,
  matchId,
  slots: initialSlots,
  poolPlayers: initialPool,
  lineupStatus,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [slots, setSlots] = useState<EditableSlot[]>(initialSlots);
  const [pool, setPool] = useState<PoolPlayer[]>(initialPool);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [regenerating, setRegenerating] = useState(false);

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
  const hasWithdrawal = initialSlots.some((s) => s.withdrawnName);

  function swapSlots(i: number, j: number) {
    if (i === j) return;
    const next = [...slots];
    const [a, b] = [next[i], next[j]];
    next[i] = { ...next[i], playerId: b.playerId, playerName: b.playerName, singlesElo: b.singlesElo, doublesElo: b.doublesElo, acknowledged: b.acknowledged };
    next[j] = { ...next[j], playerId: a.playerId, playerName: a.playerName, singlesElo: a.singlesElo, doublesElo: a.doublesElo, acknowledged: a.acknowledged };
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
          ? { ...s, playerId: player.id, playerName: player.name, singlesElo: player.singlesElo, doublesElo: player.doublesElo, acknowledged: null, withdrawnName: null }
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
        { id: slot.playerId!, name: slot.playerName!, singlesElo: slot.singlesElo, doublesElo: slot.doublesElo, rsvpStatus: allPlayersMap.get(slot.playerId!)?.rsvpStatus ?? null },
      ])
    );
    setSlots((prev) =>
      prev.map((s, i) =>
        i === slotIdx ? { ...s, playerId: null, playerName: null, singlesElo: 0, doublesElo: 0, acknowledged: null, withdrawnName: null } : s
      )
    );
    setSelectedIdx(null);
  }

  function handleSlotTap(idx: number) {
    if (selectedIdx === null) setSelectedIdx(idx);
    else if (selectedIdx === idx) setSelectedIdx(null);
    else swapSlots(selectedIdx, idx);
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
      if (!res.ok) { setMessage("Failed to generate lineup"); return; }
      const data = (await res.json()) as {
        lineup: { slots: { position: string; playerId: string; playerName: string; score: number }[] };
      };
      const optimizerSlots = data.lineup.slots;
      const newSlots: EditableSlot[] = slots.map((cur) => {
        const match = optimizerSlots.find((s) => s.position === cur.position);
        if (match) {
          const full = allPlayersMap.get(match.playerId);
          return { position: cur.position, playerId: match.playerId, playerName: match.playerName, singlesElo: full?.singlesElo ?? match.score, doublesElo: full?.doublesElo ?? match.score, acknowledged: null, withdrawnName: null };
        }
        return { ...cur, playerId: null, playerName: null, singlesElo: 0, doublesElo: 0, acknowledged: null, withdrawnName: null };
      });
      const newStarterIds = new Set(newSlots.filter((s) => s.playerId).map((s) => s.playerId));
      setSlots(newSlots);
      setPool(sortPool(Array.from(allPlayersMap.values()).filter((p) => !newStarterIds.has(p.id))));
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

  // ── View mode ──
  if (!editing) {
    const starters = slots.filter((s) => s.playerId || s.withdrawnName);
    const confirmedCount = starters.filter((s) => s.acknowledged === 1).length;
    const pendingCount = starters.filter((s) => s.playerId && s.acknowledged === null).length;
    const declinedCount = starters.filter((s) => s.acknowledged === 0).length;

    return (
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold">
            Lineup
            <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
              lineupStatus === "confirmed" ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
            }`}>
              {lineupStatus}
            </span>
          </h2>
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-sky-700 transition-colors"
          >
            Edit Lineup
          </button>
        </div>

        <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
          {slots.map((s) => {
            const isWithdrawn = !s.playerId && s.withdrawnName;
            return (
              <div key={s.position} className={`flex items-center justify-between px-4 py-3 ${isWithdrawn ? "bg-danger/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-slate-400 w-8">{s.position}</span>
                  {isWithdrawn ? (
                    <>
                      <span className="font-medium text-sm line-through text-slate-400">{s.withdrawnName}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-danger/10 text-danger">Withdrawn</span>
                    </>
                  ) : s.playerId ? (
                    <Link href={`/player/${s.playerId}`} className="font-medium text-sm text-primary-light hover:underline">
                      {s.playerName}
                    </Link>
                  ) : (
                    <span className="text-sm text-danger/70 italic">Vacant</span>
                  )}
                </div>
                {lineupStatus === "confirmed" && s.playerId && !isWithdrawn && (
                  <AckBadge value={s.acknowledged} />
                )}
              </div>
            );
          })}
        </div>

        {hasWithdrawal && (
          <p className="text-xs text-danger mt-2">
            A player has withdrawn. <button onClick={() => setEditing(true)} className="underline font-medium">Edit the lineup</button> to pick a replacement.
          </p>
        )}

        {lineupStatus === "confirmed" && (
          <div className="mt-2 text-xs text-slate-500">
            Confirmations: {confirmedCount}/{starters.filter((s) => s.playerId).length} confirmed
            {pendingCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {pendingCount} pending</span>}
            {declinedCount > 0 && <span className="text-danger"> · {declinedCount} declined</span>}
          </div>
        )}

        {message && <p className="text-sm text-primary-light font-medium mt-2">{message}</p>}
      </section>
    );
  }

  // ── Edit mode ──
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
        <button
          onClick={() => { setEditing(false); setSelectedIdx(null); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {hasVacant ? (
          <span className="text-danger font-medium">Select a vacant position, then pick a player from the pool below</span>
        ) : selectedIdx !== null ? (
          <span className="text-sky-600 dark:text-sky-400 animate-pulse font-medium">Tap another position to swap, or pick a player from the pool below</span>
        ) : (
          "Tap a position to select it, then swap or substitute"
        )}
      </p>

      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        {groupSlots(slots).map((group) => (
          <div key={group.key}>
            <div className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800/70 border-b border-border">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group.label}</span>
            </div>
            {group.items.map(({ item: slot, idx }) => {
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500 w-8">{slot.position}</span>
                    {isVacant ? (
                      <span className="text-sm font-medium text-danger/70 italic">
                        {slot.withdrawnName ? `Needs player (was ${slot.withdrawnName})` : "Needs player"}
                      </span>
                    ) : (
                      <span className={`font-medium text-sm ${isSelected ? "text-sky-700 dark:text-sky-300" : "text-slate-900 dark:text-white"}`}>
                        {slot.playerName}
                      </span>
                    )}
                    {!isVacant && lineupStatus === "confirmed" && slot.acknowledged !== null && (
                      <span className={`w-2 h-2 rounded-full ${slot.acknowledged === 1 ? "bg-accent" : "bg-danger"}`} title={slot.acknowledged === 1 ? "Confirmed" : "Declined"} />
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
                        onClick={(e) => { e.stopPropagation(); removeFromLineup(idx); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
                        title="Remove from lineup"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
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
                    {idx < slots.length - 1 && (
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

        <div className="flex flex-col gap-2 p-4 border-t border-border bg-white dark:bg-slate-900">
          {hasVacant && <p className="text-xs text-danger text-center">Fill all positions before saving</p>}
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
                onClick={() => { if (selectedIdx !== null) subIn(p, selectedIdx); }}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  selectedIdx !== null
                    ? "cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20 active:bg-sky-100 dark:active:bg-sky-900/40"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    p.rsvpStatus === "yes" ? "bg-accent" : p.rsvpStatus === "maybe" ? "bg-warning" : p.rsvpStatus === "no" ? "bg-danger" : "bg-slate-300 dark:bg-slate-600"
                  }`} />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">{p.singlesElo}<span className="text-slate-300 dark:text-slate-600">/</span>{p.doublesElo}</span>
                  {p.rsvpStatus && (
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      p.rsvpStatus === "yes" ? "bg-accent/10 text-accent" : p.rsvpStatus === "maybe" ? "bg-warning/10 text-warning" : p.rsvpStatus === "no" ? "bg-danger/10 text-danger" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                    }`}>
                      {p.rsvpStatus}
                    </span>
                  )}
                  {selectedIdx !== null && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">Sub In</span>
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
