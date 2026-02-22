"use client";

import { useState } from "react";

interface LineupSlot {
  position: string;
  playerId: string;
  playerName: string;
  score: number;
}

interface LineupResult {
  slots: LineupSlot[];
  unassigned: { id: string; name: string; singlesElo: number }[];
  alternates: { id: string; name: string; singlesElo: number }[];
}

export function LineupGenerator({ slug, matchId }: { slug: string; matchId: string }) {
  const [lineup, setLineup] = useState<LineupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function generateLineup() {
    setLoading(true);
    setMessage("");
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

  function swapPlayers(idx1: number, idx2: number) {
    if (!lineup) return;
    const next = { ...lineup, slots: [...lineup.slots] };
    const temp = { ...next.slots[idx1] };
    next.slots[idx1] = { ...next.slots[idx1], playerId: next.slots[idx2].playerId, playerName: next.slots[idx2].playerName, score: next.slots[idx2].score };
    next.slots[idx2] = { ...next.slots[idx2], playerId: temp.playerId, playerName: temp.playerName, score: temp.score };
    setLineup(next);
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
        <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {lineup.slots.map((s, i) => (
              <div key={s.position} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase text-slate-400 w-10">{s.position}</span>
                  <span className="font-medium text-sm">{s.playerName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{s.score}</span>
                  {i > 0 && (
                    <button onClick={() => swapPlayers(i, i - 1)} className="text-xs text-slate-400 hover:text-primary-light p-1">
                      ↑
                    </button>
                  )}
                  {i < lineup.slots.length - 1 && (
                    <button onClick={() => swapPlayers(i, i + 1)} className="text-xs text-slate-400 hover:text-primary-light p-1">
                      ↓
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {lineup.alternates.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-border">
              <p className="text-xs font-semibold text-slate-400 mb-1">Alternates</p>
              {lineup.alternates.map((a) => (
                <p key={a.id} className="text-sm">{a.name} ({a.singlesElo})</p>
              ))}
            </div>
          )}

          <div className="flex gap-2 p-4 border-t border-border">
            <button
              onClick={() => saveLineup(false)}
              disabled={saving}
              className="flex-1 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              onClick={() => saveLineup(true)}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              Confirm Lineup
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
