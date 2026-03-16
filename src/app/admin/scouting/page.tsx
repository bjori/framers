"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

interface TeamStat {
  team_name: string;
  player_count: number;
  oldest_fetch: string;
  newest_fetch: string;
  avg_rating: number | null;
  playersWithHistory: number;
}

interface ScoutData {
  teamStats: TeamStat[];
  ownTeams: string[];
  oppTeams: string[];
}

// Known mapping of our team names to TennisRecord team names
const OWN_TEAM_TR_NAMES: Record<string, string> = {
  "Senior Framers 2026": "GREENBROOK RS 40AM3.0A",
  "Junior Framers 2026": "GREENBROOK RS 18AM3.0A",
};

export default function ScoutingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ScoutData | null>(null);
  const [scouting, setScouting] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    const res = await fetch("/api/admin/tr-scout");
    if (res.ok) {
      setData((await res.json()) as ScoutData);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
      setLoading(false);
      loadData();
    });
  }, [router, loadData]);

  async function scoutTeam(teamName: string, isOwnTeam: boolean, force = false) {
    setScouting(teamName);
    setLog((prev) => [...prev, `Scouting ${teamName}...`]);

    try {
      const res = await fetch("/api/admin/tr-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamName,
          year: 2026,
          isOwnTeam,
          force,
        }),
      });

      const result = (await res.json()) as { ok?: boolean; playerCount?: number; logs?: string[]; error?: string };
      if (result.ok) {
        setLog((prev) => [...prev, `Done: ${teamName} — ${result.playerCount} players`]);
        if (result.logs) {
          setLog((prev) => [...prev, ...result.logs!.slice(-5)]);
        }
      } else {
        setLog((prev) => [...prev, `Error: ${teamName} — ${result.error}`]);
      }
    } catch (e) {
      setLog((prev) => [...prev, `Error: ${teamName} — ${e instanceof Error ? e.message : String(e)}`]);
    }

    setScouting(null);
    loadData();
  }

  async function backfillAll(force = false) {
    setBackfilling(true);
    setLog((prev) => [...prev, "Starting backfill of all teams..."]);

    try {
      const res = await fetch("/api/admin/tr-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backfillAll: true, year: 2026, force }),
      });

      const result = (await res.json()) as {
        ok?: boolean;
        results?: { team: string; isOwn: boolean; playerCount: number; error?: string }[];
        error?: string;
      };

      if (result.ok && result.results) {
        for (const r of result.results) {
          if (r.error) {
            setLog((prev) => [...prev, `FAIL: ${r.team} — ${r.error}`]);
          } else {
            setLog((prev) => [...prev, `OK: ${r.team} — ${r.playerCount} players`]);
          }
        }
        setLog((prev) => [...prev, `Backfill complete: ${result.results!.filter((r) => !r.error).length}/${result.results!.length} teams succeeded`]);
      } else {
        setLog((prev) => [...prev, `Backfill error: ${result.error}`]);
      }
    } catch (e) {
      setLog((prev) => [...prev, `Backfill error: ${e instanceof Error ? e.message : String(e)}`]);
    }

    setBackfilling(false);
    loadData();
  }

  function isStale(fetchedAt: string): boolean {
    return new Date(fetchedAt).getTime() < Date.now() - 7 * 86400000;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  // Build a unified list of all teams (own + opponents) with their cached status
  const ownTeamTRSet = new Set(Object.values(OWN_TEAM_TR_NAMES));
  const allTeamNames = new Set<string>();
  for (const name of Object.values(OWN_TEAM_TR_NAMES)) allTeamNames.add(name);
  if (data) {
    for (const t of data.oppTeams) allTeamNames.add(t);
    for (const ts of data.teamStats) allTeamNames.add(ts.team_name);
  }

  const statsMap = new Map(data?.teamStats.map((t) => [t.team_name, t]) ?? []);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "TennisRecord Scouting" }]} />
      <h1 className="text-2xl font-bold">TennisRecord Scouting</h1>

      <div className="flex gap-3">
        <button
          onClick={() => backfillAll(false)}
          disabled={backfilling || !!scouting}
          className="bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-sky-600"
        >
          {backfilling ? "Backfilling..." : "Backfill All Teams"}
        </button>
        <button
          onClick={() => backfillAll(true)}
          disabled={backfilling || !!scouting}
          className="bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-amber-600"
        >
          Force Refresh All
        </button>
      </div>

      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-center">Players</th>
              <th className="px-4 py-3 text-center">History</th>
              <th className="px-4 py-3 text-center">Avg Rating</th>
              <th className="px-4 py-3">Last Fetched</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...allTeamNames].sort().map((teamName) => {
              const stat = statsMap.get(teamName);
              const isOwn = ownTeamTRSet.has(teamName);
              const stale = stat ? isStale(stat.oldest_fetch) : true;

              return (
                <tr key={teamName} className="hover:bg-surface/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{teamName}</div>
                    {isOwn && <span className="text-xs text-sky-600 font-semibold">OUR TEAM</span>}
                  </td>
                  <td className="px-4 py-3 text-center">{stat?.player_count ?? "—"}</td>
                  <td className="px-4 py-3 text-center">{stat?.playersWithHistory ?? "—"}</td>
                  <td className="px-4 py-3 text-center font-mono">
                    {stat?.avg_rating ? stat.avg_rating.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {stat ? formatDate(stat.newest_fetch) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!stat ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-slate-400" title="Not scouted" />
                    ) : stale ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Stale" />
                    ) : (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Fresh" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => scoutTeam(teamName, isOwn)}
                      disabled={!!scouting || backfilling}
                      className="text-xs text-sky-600 hover:text-sky-500 font-semibold disabled:opacity-50"
                    >
                      {scouting === teamName ? "Scouting..." : "Scout"}
                    </button>
                    {stat && (
                      <button
                        onClick={() => scoutTeam(teamName, isOwn, true)}
                        disabled={!!scouting || backfilling}
                        className="text-xs text-amber-600 hover:text-amber-500 font-semibold disabled:opacity-50 ml-3"
                      >
                        Refresh
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {allTeamNames.size === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No teams found. Run USTA sync first to populate opponent teams.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="bg-slate-900 text-slate-300 rounded-xl p-4 font-mono text-xs max-h-80 overflow-y-auto">
          {log.map((line, i) => (
            <div key={i} className={line.includes("Error") || line.includes("FAIL") ? "text-red-400" : line.includes("Done") || line.includes("OK") ? "text-green-400" : ""}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
