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
        Subscribe to your personal calendar feed to see all your matches in your calendar app.
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
        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={feedUrl}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-xs font-mono truncate"
            />
            <button
              onClick={copyUrl}
              className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-light transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Add this URL to Google Calendar, Apple Calendar, or Outlook as a subscription.
          </p>
        </div>
      )}
    </section>
  );
}
