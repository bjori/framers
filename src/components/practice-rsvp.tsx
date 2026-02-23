"use client";

import { useState } from "react";

function useRsvp(sessionId: string, currentStatus: string | null) {
  const [status, setStatus] = useState(currentStatus);
  const [submitting, setSubmitting] = useState(false);

  async function handleRsvp(newStatus: "yes" | "maybe" | "no") {
    const prev = status;
    setSubmitting(true);
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status: newStatus }),
    });
    if (res.ok) {
      setStatus(newStatus);
      setSubmitting(false);
      return { prev, next: newStatus };
    }
    setSubmitting(false);
    return null;
  }

  return { status, submitting, handleRsvp };
}

export function PracticeRsvpWithCount({
  sessionId,
  currentStatus,
  initialYes,
  initialMaybe,
}: {
  sessionId: string;
  currentStatus: string | null;
  initialYes: number;
  initialMaybe: number;
}) {
  const [yesCount, setYesCount] = useState(initialYes);
  const [maybeCount, setMaybeCount] = useState(initialMaybe);
  const { status, submitting, handleRsvp } = useRsvp(sessionId, currentStatus);

  async function onRsvp(newStatus: "yes" | "maybe" | "no") {
    const result = await handleRsvp(newStatus);
    if (!result) return;
    const { prev, next } = result;
    if (prev === "yes") setYesCount((c) => c - 1);
    if (prev === "maybe") setMaybeCount((c) => c - 1);
    if (next === "yes") setYesCount((c) => c + 1);
    if (next === "maybe") setMaybeCount((c) => c + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-accent font-bold">{yesCount} going</span>
        {maybeCount > 0 && <span className="text-warning font-bold">{maybeCount} maybe</span>}
      </div>
      <div className="flex items-center gap-2">
        {(["yes", "maybe", "no"] as const).map((s) => (
          <button
            key={s}
            onClick={() => onRsvp(s)}
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
    </div>
  );
}

export function PracticeRsvp({
  sessionId,
  currentStatus,
  compact,
}: {
  sessionId: string;
  currentStatus: string | null;
  compact?: boolean;
}) {
  const { status, submitting, handleRsvp: doRsvp } = useRsvp(sessionId, currentStatus);

  async function handleRsvp(newStatus: "yes" | "maybe" | "no") {
    await doRsvp(newStatus);
  }

  if (compact) {
    return (
      <div className="flex gap-1">
        {(["yes", "maybe", "no"] as const).map((s) => (
          <button
            key={s}
            onClick={() => handleRsvp(s)}
            disabled={submitting}
            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${
              status === s
                ? s === "yes" ? "bg-accent text-white"
                  : s === "maybe" ? "bg-warning text-white"
                  : "bg-danger text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {s === "yes" ? "In" : s === "maybe" ? "?" : "Out"}
          </button>
        ))}
      </div>
    );
  }

  return (
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
  );
}
