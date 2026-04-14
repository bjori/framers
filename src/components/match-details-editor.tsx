"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MatchDetailsEditor({
  slug,
  matchId,
  currentTime,
  currentLocation,
  currentNotes,
  currentCaptainNotes,
}: {
  slug: string;
  matchId: string;
  currentTime: string | null;
  currentLocation: string | null;
  currentNotes: string | null;
  currentCaptainNotes: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(currentTime ?? "");
  const [location, setLocation] = useState(currentLocation ?? "");
  const [notes, setNotes] = useState(currentNotes ?? "");
  const [captainNotes, setCaptainNotes] = useState(currentCaptainNotes ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/team/${slug}/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_time: time || null,
        location: location || null,
        notes: notes || null,
        captain_notes: captainNotes || null,
      }),
    });
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
    setSaving(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
      >
        Edit details
      </button>
    );
  }

  return (
    <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-sm font-semibold">Edit Match Details</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Start Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Notes (e.g. staggered start times)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="D1 & S1 start at 6:30pm, D2 & D3 start at 8:00pm"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-amber-700 dark:text-amber-400 font-semibold block mb-1">
          Captain&apos;s Note <span className="font-normal text-slate-400">(included in all team emails &amp; calendar)</span>
        </label>
        <textarea
          value={captainNotes}
          onChange={(e) => setCaptainNotes(e.target.value)}
          placeholder="e.g. Kickoff delayed to 8pm due to rain, D1 and S1 swapping timeslots"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="px-4 py-2 rounded-lg border border-border text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
