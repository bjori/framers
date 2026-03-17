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

  useEffect(() => {
    if (dismissed) return;
    setLoading(true);
    fetch("/api/ics/token")
      .then((res) => res.json() as Promise<{ token?: string; error?: string }>)
      .then((data) => {
        if (data.token) {
          setFeedUrl(`${window.location.origin}/api/ics/${data.token}/feed.ics`);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dismissed]);

  const webcalUrl = feedUrl?.replace(/^https?:\/\//, "webcal://") ?? null;

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
      {loading ? (
        <div className="py-4 flex items-center justify-center gap-2 text-sm text-slate-500">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          Loading…
        </div>
      ) : feedUrl ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl!)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Add to Google Calendar
            </a>
            <a
              href={webcalUrl!}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#000] dark:bg-white text-white dark:text-black text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 384 512">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
              </svg>
              Add to Apple Calendar
            </a>
          </div>
          <details className="group">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
              Or copy URL (Google: Settings → Add calendar → From URL)
            </summary>
            <div className="flex items-stretch gap-2 mt-2">
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
          </details>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Your calendar will auto-refresh with lineup changes.{" "}
            <a href={feedUrl} target="_blank" rel="noopener noreferrer" className="text-primary-light hover:underline">
              Verify feed
            </a>
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Unable to load calendar link.</p>
      )}
    </section>
  );
}
