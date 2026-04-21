"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface LineOverride {
  line: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
}

export function MatchDetailsEditor({
  slug,
  matchId,
  currentDate,
  currentTime,
  currentLocation,
  currentNotes,
  currentCaptainNotes,
  matchFormat,
  currentLineSchedules,
}: {
  slug: string;
  matchId: string;
  currentDate: string;
  currentTime: string | null;
  currentLocation: string | null;
  currentNotes: string | null;
  currentCaptainNotes: string | null;
  matchFormat: { singles: number; doubles: number };
  currentLineSchedules: LineOverride[];
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [time, setTime] = useState(currentTime ?? "");
  const [location, setLocation] = useState(currentLocation ?? "");
  const [notes, setNotes] = useState(currentNotes ?? "");
  const [captainNotes, setCaptainNotes] = useState(currentCaptainNotes ?? "");
  const [saving, setSaving] = useState(false);

  const allLines = useMemo(() => {
    const ls: string[] = [];
    for (let i = 1; i <= matchFormat.singles; i++) ls.push(`S${i}`);
    for (let i = 1; i <= matchFormat.doubles; i++) ls.push(`D${i}`);
    return ls;
  }, [matchFormat.singles, matchFormat.doubles]);

  const hasInitialOverrides = currentLineSchedules.length > 0;
  const [splitting, setSplitting] = useState(hasInitialOverrides);
  const [lineRows, setLineRows] = useState<Record<string, { date: string; time: string }>>(() => {
    const init: Record<string, { date: string; time: string }> = {};
    for (const line of allLines) {
      const existing = currentLineSchedules.find((o) => o.line.toUpperCase() === line.toUpperCase());
      init[line] = {
        date: existing?.scheduled_date ?? "",
        time: existing?.scheduled_time ?? "",
      };
    }
    return init;
  });
  const router = useRouter();

  function updateLine(line: string, field: "date" | "time", value: string) {
    setLineRows((prev) => ({ ...prev, [line]: { ...prev[line], [field]: value } }));
  }

  function copyToAllLines(line: string) {
    const src = lineRows[line];
    if (!src) return;
    const next: Record<string, { date: string; time: string }> = {};
    for (const l of allLines) next[l] = { ...src };
    setLineRows(next);
  }

  // Compute the set of effective play dates the captain is about to save,
  // so we can warn if it differs from what's currently on file.
  const currentPlayDates = useMemo(() => {
    const dates = new Set<string>();
    for (const line of allLines) {
      const override = currentLineSchedules.find((o) => o.line.toUpperCase() === line.toUpperCase());
      dates.add(override?.scheduled_date || currentDate);
    }
    return [...dates].sort();
  }, [allLines, currentLineSchedules, currentDate]);

  const nextPlayDates = useMemo(() => {
    const dates = new Set<string>();
    const base = date || currentDate;
    if (splitting) {
      for (const line of allLines) {
        const row = lineRows[line] ?? { date: "", time: "" };
        dates.add(row.date || base);
      }
    } else {
      dates.add(base);
    }
    return [...dates].sort();
  }, [splitting, lineRows, date, currentDate, allLines]);

  const willResetRsvps =
    currentPlayDates.length !== nextPlayDates.length ||
    currentPlayDates.some((d, i) => d !== nextPlayDates[i]);

  async function save() {
    if (willResetRsvps) {
      const confirmed = window.confirm(
        "The match date is changing, so everyone's RSVP will be reset. Players (including those in the lineup) will need to confirm or decline again for the new date(s). The lineup itself will be preserved.\n\nContinue?",
      );
      if (!confirmed) return;
    }

    setSaving(true);

    const line_schedules = splitting
      ? allLines.map((line) => {
          const row = lineRows[line] ?? { date: "", time: "" };
          return {
            line,
            scheduled_date: row.date || null,
            scheduled_time: row.time || null,
          };
        })
      : [];

    const res = await fetch(`/api/team/${slug}/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_date: date || null,
        match_time: time || null,
        location: location || null,
        notes: notes || null,
        captain_notes: captainNotes || null,
        line_schedules,
      }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { rsvps_reset?: number };
      if (data.rsvps_reset && data.rsvps_reset > 0) {
        alert(
          `Saved. ${data.rsvps_reset} RSVP${data.rsvps_reset === 1 ? "" : "s"} reset — players will see a fresh "can you make it?" prompt.`,
        );
      }
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
          <label className="text-xs text-slate-500 block mb-1">Match Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Start Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Location</label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
        />
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
          placeholder="e.g. Rain reschedule — doubles Fri 4/24, singles Tue 5/5"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-sm"
        />
      </div>

      <div className="pt-3 border-t border-border">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={splitting}
            onChange={(e) => setSplitting(e.target.checked)}
            className="rounded border-border"
          />
          <span className="font-medium">Schedule lines separately</span>
          <span className="text-xs text-slate-500">— e.g. doubles one day, singles another (rain split / staggered times)</span>
        </label>

        {splitting && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              Leave a row blank to inherit the match date/time above. Each row below overrides the default for that line only.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    <th className="text-left py-1 pr-2">Line</th>
                    <th className="text-left py-1 pr-2">Date</th>
                    <th className="text-left py-1 pr-2">Time</th>
                    <th className="text-left py-1 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {allLines.map((line) => {
                    const row = lineRows[line] ?? { date: "", time: "" };
                    return (
                      <tr key={line} className="border-t border-border/50">
                        <td className="py-1.5 pr-2 font-mono font-semibold text-xs">{line}</td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => updateLine(line, "date", e.target.value)}
                            placeholder={date}
                            className="px-2 py-1 rounded border border-border bg-surface text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="time"
                            value={row.time}
                            onChange={(e) => updateLine(line, "time", e.target.value)}
                            placeholder={time}
                            className="px-2 py-1 rounded border border-border bg-surface text-xs"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <button
                            type="button"
                            onClick={() => copyToAllLines(line)}
                            className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline"
                            title="Copy this row's date+time to all other lines"
                          >
                            apply to all
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {willResetRsvps && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200">
          <strong>Heads up:</strong> the match date is changing, so saving will
          reset everyone&apos;s RSVP for this match. The lineup itself will be
          preserved, but every player (including lineup starters) will need to
          confirm or decline against the new date(s) so you can see who&apos;s
          still available.
        </div>
      )}

      <div className="flex gap-2 pt-2">
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
