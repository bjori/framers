"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TournamentSchedule, type TournamentMatch } from "@/components/tournament-schedule";
import { TournamentStandings } from "@/components/tournament-standings";
import { TournamentRules } from "@/components/tournament-rules";

interface Standing {
  participant_id: string;
  player_id: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  elo: number;
}

type Tab = "standings" | "schedule" | "rules";

const TABS: { key: Tab; label: string }[] = [
  { key: "standings", label: "Standings" },
  { key: "schedule", label: "Schedule" },
  { key: "rules", label: "Rules" },
];

export function TournamentTabs({
  slug,
  matches,
  standings,
  isDoubles,
}: {
  slug: string;
  matches: TournamentMatch[];
  standings: Standing[];
  isDoubles: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "standings";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : "standings");

  function switchTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "standings") {
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

      {tab === "standings" && (
        <TournamentStandings standings={standings} isDoubles={isDoubles} />
      )}

      {tab === "schedule" && (
        <TournamentSchedule matches={matches} slug={slug} />
      )}

      {tab === "rules" && (
        <TournamentRules />
      )}
    </div>
  );
}
