"use client";

import { useState } from "react";

export function DashboardRsvp({
  slug,
  matchId,
  slotDate,
}: {
  slug: string;
  matchId: string;
  /** When set, the quick RSVP targets a single slot of a split-schedule match. */
  slotDate?: string;
}) {
  const [status, setStatus] = useState<"yes" | "no" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function rsvp(s: "yes" | "no") {
    setSubmitting(true);
    const res = await fetch(`/api/team/${slug}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, status: s, slotDate: slotDate ?? null }),
    });
    if (res.ok) setStatus(s);
    setSubmitting(false);
  }

  if (status) {
    return (
      <div className={`flex items-center justify-center rounded-r-lg px-5 self-stretch text-xs font-bold text-white ${
        status === "yes" ? "bg-accent" : "bg-danger"
      }`}>
        {status === "yes" ? "In" : "Out"}
      </div>
    );
  }

  return (
    <div className="flex self-stretch shrink-0" onClick={(e) => e.preventDefault()}>
      <button
        onClick={() => rsvp("yes")}
        disabled={submitting}
        className="px-5 flex items-center justify-center text-xs font-bold bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors disabled:opacity-50 border-l border-slate-200 dark:border-slate-700"
      >
        {submitting ? "…" : "In"}
      </button>
      <button
        onClick={() => rsvp("no")}
        disabled={submitting}
        className="px-5 flex items-center justify-center rounded-r-lg text-xs font-bold bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors disabled:opacity-50 border-l border-slate-200 dark:border-slate-700"
      >
        {submitting ? "…" : "Out"}
      </button>
    </div>
  );
}

export function DashboardPracticeRsvp({
  sessionId,
  initialYes,
  onCountChange,
}: {
  sessionId: string;
  initialYes: number;
  onCountChange?: (yes: number) => void;
}) {
  const [status, setStatus] = useState<"yes" | "no" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [yesCount, setYesCount] = useState(initialYes);

  async function rsvp(s: "yes" | "no") {
    setSubmitting(true);
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status: s }),
    });
    if (res.ok) {
      setStatus(s);
      const newCount = s === "yes" ? yesCount + 1 : yesCount;
      setYesCount(newCount);
      onCountChange?.(newCount);
    }
    setSubmitting(false);
  }

  if (status) {
    return (
      <div className={`flex items-center justify-center rounded-r-lg px-5 self-stretch text-xs font-bold text-white ${
        status === "yes" ? "bg-accent" : "bg-danger"
      }`}>
        {status === "yes" ? "In" : "Out"}
      </div>
    );
  }

  return (
    <div className="flex self-stretch shrink-0" onClick={(e) => e.preventDefault()}>
      <button
        onClick={() => rsvp("yes")}
        disabled={submitting}
        className="px-5 flex items-center justify-center text-xs font-bold bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors disabled:opacity-50 border-l border-slate-200 dark:border-slate-700"
      >
        {submitting ? "…" : "In"}
      </button>
      <button
        onClick={() => rsvp("no")}
        disabled={submitting}
        className="px-5 flex items-center justify-center rounded-r-lg text-xs font-bold bg-danger/10 text-danger hover:bg-danger hover:text-white transition-colors disabled:opacity-50 border-l border-slate-200 dark:border-slate-700"
      >
        {submitting ? "…" : "Out"}
      </button>
    </div>
  );
}
