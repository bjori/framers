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
  const [detailLines, setDetailLines] = useState<string[]>([]);

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
    setDetailLines([]);
    const teamSlugs = ["senior-framers-2026", "junior-framers-2026"];
    const results: string[] = [];
    const details: string[] = [];
    for (const slug of teamSlugs) {
      try {
        const res = await fetch("/api/admin/usta-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamSlug: slug }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            scorecards: number;
            updated: number;
            rosterSynced?: number;
            rosterNames?: string[];
            unmatchedRosterNames?: string[];
            ustaRosterNotOnFramers?: string[];
          };
          const ustaCount = data.rosterNames?.length ?? 0;
          const flags = data.rosterSynced ?? 0;
          results.push(
            `${slug}: ${data.scorecards} scorecards, ${data.updated} updated, ${flags} roster flags set (USTA ${ustaCount} names on official roster)`
          );
          const notOnTeam = data.ustaRosterNotOnFramers ?? [];
          if (notOnTeam.length > 0) {
            details.push(
              `${slug} — on USTA roster but not on this Framers team (${notOnTeam.length}): ${notOnTeam.join("; ")}. Add them in Admin/Players or they may be senior-only in the app.`
            );
          }
          const unmatched = data.unmatchedRosterNames ?? [];
          if (unmatched.length > 0) {
            details.push(`${slug} — not in Framers DB / name map: ${unmatched.join("; ")}`);
          }
        } else {
          const err = (await res.json()) as { error?: string };
          results.push(`${slug}: ${err.error || "failed"}`);
        }
      } catch (e) {
        results.push(`${slug}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    setMessage(`USTA sync complete: ${results.join(" | ")}`);
    setDetailLines(details);
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
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm space-y-2">
          <div>{message}</div>
          {detailLines.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-sky-900 dark:text-sky-200 space-y-1">
              {detailLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="bg-surface-alt rounded-xl border border-border p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm mb-1">Sync USTA Results</h2>
          <p className="text-xs text-slate-500 mb-3">
            Fetches scores, schedule times, and roster data from leagues.ustanorcal.com for senior and junior teams
            (each needs <code className="text-[11px]">usta_team_id</code> on the team). Schedule and scorecards apply to everyone on USTA.
            Roster sync only sets the <strong>USTA registered</strong> flag for people on <em>this</em> team&apos;s Framers roster; it does not add members.
            Official USTA count can exceed Framers if players are on USTA but not added to the team in the app — those names are listed after sync.
            Daily cron runs at 17:00 UTC (9 AM PST / 10 AM PDT, America/Los_Angeles).
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
