"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RsvpSlot {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** HH:MM (24h) or null if TBD */
  time: string | null;
  /** Lines that play in this slot, e.g. ["D1","D2","D3"] */
  lines: string[];
}

export interface SlotOverride {
  slot_date: string;
  status: string;
}

type RsvpStatus = "yes" | "maybe" | "no";

const STATUS_COLORS: Record<RsvpStatus, string> = {
  yes: "bg-accent text-white",
  maybe: "bg-warning text-white",
  no: "bg-danger text-white",
};

const STATUS_LABELS: Record<RsvpStatus, string> = {
  yes: "I'm In",
  maybe: "Maybe",
  no: "Can't Make It",
};

const STATUS_LABELS_SHORT: Record<RsvpStatus, string> = {
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};

function formatSlotTime(time: string | null) {
  if (!time) return "TBD";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatSlotDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function describeLines(lines: string[]) {
  const doubles = lines.filter((l) => l.startsWith("D")).sort();
  const singles = lines.filter((l) => l.startsWith("S")).sort();
  return [...doubles, ...singles].join("/");
}

export function MatchRsvp({
  slug,
  matchId,
  currentStatus,
  confirmed = true,
  scheduleBlocks,
  currentSlotOverrides = [],
}: {
  slug: string;
  matchId: string;
  currentStatus: string | null;
  confirmed?: boolean;
  /** Pass when the match has a split schedule to enable per-slot RSVP. */
  scheduleBlocks?: RsvpSlot[];
  currentSlotOverrides?: SlotOverride[];
}) {
  const [status, setStatus] = useState<string | null>(currentStatus);
  const [slotOverrides, setSlotOverrides] = useState<Map<string, string>>(
    () => new Map(currentSlotOverrides.map((o) => [o.slot_date, o.status])),
  );
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const distinctDates = scheduleBlocks
    ? [...new Set(scheduleBlocks.map((b) => b.date))].sort()
    : [];
  const isSplit = distinctDates.length > 1;

  async function handleRsvp(newStatus: RsvpStatus, slotDate?: string) {
    setSubmitting(true);
    const res = await fetch(`/api/team/${slug}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, status: newStatus, slotDate: slotDate ?? null }),
    });
    if (res.ok) {
      if (slotDate) {
        setSlotOverrides((prev) => {
          const next = new Map(prev);
          if (newStatus === status) {
            // Matches the overall; server dropped the override.
            next.delete(slotDate);
          } else {
            next.set(slotDate, newStatus);
          }
          return next;
        });
      } else {
        setStatus(newStatus);
        // Server also dropped any per-slot overrides that now agree with overall.
        setSlotOverrides((prev) => {
          const next = new Map<string, string>();
          for (const [k, v] of prev) if (v !== newStatus) next.set(k, v);
          return next;
        });
      }
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
                ? STATUS_COLORS[s]
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isSplit && scheduleBlocks && (
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              Different for each day?
            </p>
            <p className="text-[10px] text-slate-400">
              Blank row = follows your overall answer
            </p>
          </div>
          {distinctDates.map((date) => {
            const blocksForDate = scheduleBlocks.filter((b) => b.date === date);
            const lines = [...new Set(blocksForDate.flatMap((b) => b.lines))];
            const time = blocksForDate[0]?.time ?? null;
            const override = slotOverrides.get(date);
            const effective = (override ?? status) as string | null;
            return (
              <div key={date} className="flex items-center gap-2">
                <div className="flex-shrink-0 w-28">
                  <p className="text-xs font-semibold leading-tight">{formatSlotDate(date)}</p>
                  <p className="text-[10px] text-slate-500">
                    {formatSlotTime(time)}
                    {lines.length > 0 && <span className="ml-1 text-warning">{describeLines(lines)}</span>}
                  </p>
                </div>
                <div className="flex gap-1 flex-1">
                  {(["yes", "maybe", "no"] as const).map((s) => {
                    const isActive = effective === s;
                    const isOverride = override === s;
                    return (
                      <button
                        key={s}
                        onClick={() => handleRsvp(s, date)}
                        disabled={submitting}
                        title={
                          isActive && !isOverride
                            ? `Inherited from overall (${STATUS_LABELS_SHORT[s]}). Click another to override just this day.`
                            : undefined
                        }
                        className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase transition-colors ${
                          isActive
                            ? isOverride
                              ? STATUS_COLORS[s]
                              : `${STATUS_COLORS[s]} opacity-60`
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {STATUS_LABELS_SHORT[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
