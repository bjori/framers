"use client";

import { useState, useEffect } from "react";

export default function CalendarSubscribe() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("calendar-feed-dismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  const webcalUrl = feedUrl?.replace(/^https?:\/\//, "webcal://") ?? null;

  async function getFeedUrl() {
    setLoading(true);
    try {
      const res = await fetch("/api/ics/token");
      const data = (await res.json()) as { token?: string; error?: string };
      if (data.token) {
        setFeedUrl(`${window.location.origin}/api/ics/${data.token}/feed.ics`);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("calendar-feed-dismissed", "1");
  }

  if (dismissed && !feedUrl) {
    return (
      <button onClick={() => setDismissed(false)} className="text-xs text-primary-light hover:underline">
        Show calendar feed link
      </button>
    );
  }

  return (
    <section className="bg-surface-alt rounded-xl border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Calendar Feed</h2>
        {!feedUrl && (
          <button onClick={dismiss} className="text-xs text-slate-400 hover:text-slate-600" aria-label="Dismiss">
            &times;
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        Subscribe to your personal calendar feed — match dates show as HOLDs, then update with your lineup position when confirmed.
      </p>
      {!feedUrl ? (
        <button
          onClick={getFeedUrl}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {loading ? "Generating..." : "Get Calendar Link"}
        </button>
      ) : (
        <div className="space-y-3">
          <a
            href={webcalUrl!}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-light transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Subscribe in Calendar App
          </a>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={feedUrl}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-mono truncate"
            />
            <button
              onClick={copyUrl}
              className="px-3 py-2 rounded-lg border border-border bg-surface text-sm font-semibold hover:bg-surface-alt transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="text-xs text-slate-400 space-y-1">
            <p><strong>iPhone/Mac:</strong> Tap &ldquo;Subscribe in Calendar App&rdquo; above.</p>
            <p><strong>Google Calendar:</strong> Copy the URL → Settings → Add calendar → From URL → paste.</p>
            <p className="text-slate-300 dark:text-slate-500">Your calendar will auto-refresh with lineup changes.</p>
          </div>
        </div>
      )}
    </section>
  );
}
