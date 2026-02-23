"use client";

import { useState, useEffect } from "react";

export function PlayerPreferences({ slug }: { slug: string }) {
  const [doublesOnly, setDoublesOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/team/${slug}/preferences`)
      .then((r) => r.ok ? (r.json() as Promise<{ preferences: { doublesOnly?: boolean } }>) : null)
      .then((d) => {
        if (d) setDoublesOnly(d.preferences.doublesOnly ?? false);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [slug]);

  async function toggle() {
    const newVal = !doublesOnly;
    setSaving(true);
    const res = await fetch(`/api/team/${slug}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doublesOnly: newVal }),
    });
    if (res.ok) setDoublesOnly(newVal);
    setSaving(false);
  }

  if (!loaded) return null;

  return (
    <div className="flex items-center justify-between bg-surface-alt rounded-xl border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">Doubles only</p>
        <p className="text-xs text-slate-500">I prefer not to play singles in league matches</p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          doublesOnly ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
        }`}
        aria-label="Toggle doubles only"
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            doublesOnly ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
