"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LineupAcknowledge({
  slug,
  matchId,
  position,
  currentAck,
}: {
  slug: string;
  matchId: string;
  position: string;
  currentAck: number | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [ack, setAck] = useState(currentAck);
  const router = useRouter();

  async function respond(response: "confirm" | "decline") {
    if (response === "decline" && !window.confirm("Are you sure you can't make it? The captain will be notified.")) return;
    setSubmitting(true);
    const res = await fetch(`/api/team/${slug}/lineup/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, response }),
    });
    if (res.ok) {
      setAck(response === "confirm" ? 1 : 0);
      router.refresh();
    }
    setSubmitting(false);
  }

  if (ack === 1) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
          You&apos;ve confirmed you&apos;ll be there for <strong>{position}</strong>
        </p>
        <button
          onClick={() => respond("decline")}
          disabled={submitting}
          className="mt-2 text-xs text-red-500 hover:underline disabled:opacity-50"
        >
          Actually, I can&apos;t make it
        </button>
      </div>
    );
  }

  if (ack === 0) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
        <p className="text-sm text-red-700 dark:text-red-300">
          You&apos;ve indicated you can&apos;t make it. The captain has been notified.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3 text-center">
        You&apos;re in the lineup at <strong>{position}</strong> &mdash; can you make it?
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => respond("confirm")}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg bg-accent text-white text-sm font-bold disabled:opacity-50 hover:bg-green-600 transition-colors"
        >
          {submitting ? "..." : "I\u2019ll be there"}
        </button>
        <button
          onClick={() => respond("decline")}
          disabled={submitting}
          className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-bold disabled:opacity-50 hover:bg-red-600 transition-colors"
        >
          {submitting ? "..." : "Can\u2019t make it"}
        </button>
      </div>
    </div>
  );
}
