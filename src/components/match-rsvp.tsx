"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MatchRsvp({
  slug,
  matchId,
  currentStatus,
  confirmed = true,
}: {
  slug: string;
  matchId: string;
  currentStatus: string | null;
  confirmed?: boolean;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleRsvp(newStatus: "yes" | "maybe" | "no") {
    setSubmitting(true);
    const res = await fetch(`/api/team/${slug}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, status: newStatus }),
    });
    if (res.ok) {
      setStatus(newStatus);
      router.refresh();
    }
    setSubmitting(false);
  }

  if (!confirmed) {
    return (
      <section className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <h2 className="text-sm font-semibold mb-2 text-slate-500 dark:text-slate-400">Your RSVP</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Availability opens once the opponent posts the match time.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface-alt rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold mb-2">Your RSVP</h2>
      <div className="flex items-center gap-2">
        {(["yes", "maybe", "no"] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleRsvp(s)}
            disabled={submitting}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold uppercase transition-colors ${
              status === s
                ? s === "yes" ? "bg-accent text-white"
                  : s === "maybe" ? "bg-warning text-white"
                  : "bg-danger text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {s === "yes" ? "I'm In" : s === "maybe" ? "Maybe" : "Can't Make It"}
          </button>
        ))}
      </div>
    </section>
  );
}
