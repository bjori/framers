"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

export default function UstaSyncPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
      setLoading(false);
    });
  }, [router]);

  async function syncUsta() {
    setSyncing(true);
    setMessage("");
    const teamSlugs = ["senior-framers-2026", "junior-framers-2026"];
    const results: string[] = [];
    for (const slug of teamSlugs) {
      try {
        const res = await fetch("/api/admin/usta-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamSlug: slug }),
        });
        if (res.ok) {
          const data = (await res.json()) as { scorecards: number; updated: number; rosterSynced?: number };
          results.push(`${slug}: ${data.scorecards} scorecards, ${data.updated} updated, ${data.rosterSynced ?? 0} rostered`);
        } else {
          const err = (await res.json()) as { error?: string };
          results.push(`${slug}: ${err.error || "failed"}`);
        }
      } catch (e) {
        results.push(`${slug}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    setMessage(`USTA sync complete: ${results.join(" | ")}`);
    setSyncing(false);
  }

  async function recalculateElo() {
    setRecalculating(true);
    setMessage("");
    const res = await fetch("/api/admin/elo/recalculate", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { tournamentMatchesProcessed: number; leagueResultsProcessed: number; eloUpdates: number };
      setMessage(`ELO recalculated: ${data.tournamentMatchesProcessed} tournament + ${data.leagueResultsProcessed} league matches, ${data.eloUpdates} updates`);
    } else {
      setMessage("Failed to recalculate ELO");
    }
    setRecalculating(false);
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "USTA Sync & ELO" }]} />
      <h1 className="text-2xl font-bold">USTA Sync & ELO</h1>

      {message && (
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="bg-surface-alt rounded-xl border border-border p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm mb-1">Sync USTA Results</h2>
          <p className="text-xs text-slate-500 mb-3">
            Fetches scores, schedule times, and roster data from leagues.ustanorcal.com for all active teams.
            This also runs automatically every day at 9 AM Pacific via the cron job.
          </p>
          <button
            onClick={syncUsta}
            disabled={syncing}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync USTA Results"}
          </button>
        </div>

        <hr className="border-border" />

        <div>
          <h2 className="font-semibold text-sm mb-1">Recalculate All ELO</h2>
          <p className="text-xs text-slate-500 mb-3">
            Resets all player ELO ratings to their NTRP seed and replays every tournament + league match chronologically.
            Use after fixing score data or importing historical results. ELO is also auto-recalculated when new scores are synced via cron.
          </p>
          <button
            onClick={recalculateElo}
            disabled={recalculating}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {recalculating ? "Recalculating..." : "Recalculate All ELO"}
          </button>
        </div>
      </div>
    </div>
  );
}
