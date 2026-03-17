"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TeamSchedule } from "@/components/team-schedule";
import AvailabilityGrid from "@/components/availability-grid";
import { PlayerPreferences } from "@/components/player-preferences";

interface LeagueMatch {
  id: string;
  round_number: number;
  opponent_team: string;
  match_date: string;
  match_time: string | null;
  location: string | null;
  is_home: number;
  team_result: string | null;
  team_score: string | null;
  status: string;
  notes: string | null;
}

interface TeamMember {
  player_id: string;
  name: string;
  role: string;
  ntrp_rating: number;
  ntrp_type: string;
  singles_elo: number;
  doubles_elo: number;
  preferences: string | null;
}

interface AvailabilityEntry {
  player_id: string;
  player_name: string;
  match_id: string;
  status: string | null;
}

type SortKey = "name" | "singles_elo" | "doubles_elo" | "ntrp";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: "name", label: "Name", shortLabel: "Name" },
  { key: "singles_elo", label: "Singles ELO", shortLabel: "S-ELO" },
  { key: "doubles_elo", label: "Doubles ELO", shortLabel: "D-ELO" },
  { key: "ntrp", label: "NTRP", shortLabel: "NTRP" },
];

function parseNtrp(ntrpType: string): number {
  const match = ntrpType.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

function sortRoster(roster: TeamMember[], sortKey: SortKey, sortDir: SortDir): TeamMember[] {
  return [...roster].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "singles_elo":
        cmp = a.singles_elo - b.singles_elo;
        break;
      case "doubles_elo":
        cmp = a.doubles_elo - b.doubles_elo;
        break;
      case "ntrp":
        cmp = parseNtrp(a.ntrp_type) - parseNtrp(b.ntrp_type);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
}

function RosterSection({ roster }: { roster: TeamMember[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const sorted = sortRoster(roster, sortKey, sortDir);
  const arrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Roster ({roster.length})</h2>
      <div className="flex gap-1 mb-3 flex-wrap">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => toggleSort(opt.key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              sortKey === opt.key
                ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <span className="hidden sm:inline">{opt.label}</span>
            <span className="sm:hidden">{opt.shortLabel}</span>
            {arrow(opt.key)}
          </button>
        ))}
      </div>
      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {sorted.map((p) => (
            <div key={p.player_id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Link href={`/player/${p.player_id}`} className="font-medium text-primary-light hover:underline">
                  {p.name}
                </Link>
                {(p.role === "captain" || p.role === "co-captain") && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                    {p.role === "captain" ? "Captain" : "Co-Captain"}
                  </span>
                )}
                {(() => { try { return JSON.parse(p.preferences || "{}").doublesOnly; } catch { return false; } })() && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning">
                    Doubles
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono ${sortKey === "singles_elo" ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-400"}`}
                  title="Singles ELO"
                >
                  {p.singles_elo}
                </span>
                <span className="text-slate-300 dark:text-slate-600 text-[10px]">/</span>
                <span
                  className={`text-[10px] font-mono ${sortKey === "doubles_elo" ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-400"}`}
                  title="Doubles ELO"
                >
                  {p.doubles_elo}
                </span>
                <span
                  className={`text-xs ${sortKey === "ntrp" ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-500"}`}
                >
                  {p.ntrp_type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type Tab = "schedule" | "roster" | "availability";

const TABS: { key: Tab; label: string }[] = [
  { key: "schedule", label: "Schedule" },
  { key: "roster", label: "Roster" },
  { key: "availability", label: "Availability" },
];

export function TeamTabs({
  slug,
  matches,
  roster,
  availability,
  isReadOnly,
  isMember,
  neededPlayers,
  currentPlayerId,
  emptyScheduleMessage,
}: {
  slug: string;
  matches: LeagueMatch[];
  roster: TeamMember[];
  availability: AvailabilityEntry[];
  isReadOnly: boolean;
  isMember: boolean;
  neededPlayers: number;
  currentPlayerId: string | null;
  emptyScheduleMessage?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "schedule";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : "schedule");

  function switchTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "schedule") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", t);
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }

  return (
    <div>
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <TeamSchedule matches={matches} isReadOnly={isReadOnly} slug={slug} emptyMessage={emptyScheduleMessage} />
      )}

      {tab === "roster" && (
        <RosterSection roster={roster} />
      )}

      {tab === "availability" && (
        <div className="space-y-6">
          {!isReadOnly && isMember && (
            <PlayerPreferences slug={slug} />
          )}
          {!isReadOnly && (
            <AvailabilityGrid
              roster={roster.map((p) => ({ player_id: p.player_id, name: p.name }))}
              matches={matches.map((m) => ({
                id: m.id,
                match_date: m.match_date,
                opponent_team: m.opponent_team,
                confirmed: !!(m.notes && m.notes.trim()),
              }))}
              availability={availability}
              neededPlayers={neededPlayers}
              currentPlayerId={currentPlayerId}
              slug={slug}
            />
          )}
          {isReadOnly && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Availability data is not shown for archived teams.</p>
          )}
        </div>
      )}
    </div>
  );
}
