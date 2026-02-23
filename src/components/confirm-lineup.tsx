"use client";

import { useState } from "react";

interface Slot {
  position: string;
  playerId: string;
}

export function ConfirmLineup({ slug, matchId, slots }: { slug: string; matchId: string; slots: Slot[] }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function confirm() {
    setConfirming(true);
    const res = await fetch(`/api/team/${slug}/lineup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        action: "confirm",
        slots: slots.map((s) => ({ position: s.position, playerId: s.playerId })),
      }),
    });
    if (res.ok) {
      setDone(true);
      window.location.reload();
    }
    setConfirming(false);
  }

  if (done) return null;

  return (
    <button
      onClick={confirm}
      disabled={confirming}
      className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:bg-green-600 transition-colors mt-3"
    >
      {confirming ? "Confirming..." : "Confirm & Notify Players"}
    </button>
  );
}
