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
}: {
  slug: string;
  matches: LeagueMatch[];
  roster: TeamMember[];
  availability: AvailabilityEntry[];
  isReadOnly: boolean;
  isMember: boolean;
  neededPlayers: number;
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
        <TeamSchedule matches={matches} isReadOnly={isReadOnly} slug={slug} />
      )}

      {tab === "roster" && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Roster ({roster.length})</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {roster.map((p) => (
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
                    <span className="text-[10px] text-slate-400 font-mono" title="Singles / Doubles ELO">
                      {p.singles_elo}<span className="text-slate-300 dark:text-slate-600">/</span>{p.doubles_elo}
                    </span>
                    <span className="text-xs text-slate-500">{p.ntrp_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "availability" && (
        <div className="space-y-6">
          {!isReadOnly && isMember && (
            <PlayerPreferences slug={slug} />
          )}
          {!isReadOnly && (
            <AvailabilityGrid
              roster={roster.map((p) => ({ player_id: p.player_id, name: p.name }))}
              matches={matches.map((m) => ({ id: m.id, match_date: m.match_date, opponent_team: m.opponent_team }))}
              availability={availability}
              neededPlayers={neededPlayers}
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
