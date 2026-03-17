"use client";

import { useState } from "react";
import Link from "next/link";

interface Player {
  id: string;
  name: string;
  ntrp_type: string;
  singles_elo: number;
  doubles_elo: number;
  tennisrecord_rating: number | null;
  teams: string;
}

type SortKey = "name" | "singles_elo" | "doubles_elo" | "ntrp" | "tr_rating";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "singles_elo", label: "Singles ELO" },
  { key: "doubles_elo", label: "Doubles ELO" },
  { key: "ntrp", label: "NTRP" },
  { key: "tr_rating", label: "TR Rating" },
];

function parseNtrp(ntrpType: string): number {
  const m = ntrpType.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : 0;
}

export function PlayerDirectory({ players }: { players: Player[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const filtered = players.filter(
    (p) => search === "" || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "singles_elo": cmp = a.singles_elo - b.singles_elo; break;
      case "doubles_elo": cmp = a.doubles_elo - b.doubles_elo; break;
      case "ntrp": cmp = parseNtrp(a.ntrp_type) - parseNtrp(b.ntrp_type); break;
      case "tr_rating": cmp = (a.tennisrecord_rating ?? 0) - (b.tennisrecord_rating ?? 0); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 rounded-lg border border-border bg-white dark:bg-slate-900 text-sm placeholder:text-slate-400"
        />
      </div>

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
            {opt.label}{arrow(opt.key)}
          </button>
        ))}
      </div>

      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left py-2.5 px-3 font-semibold">Player</th>
                <th className="text-left py-2.5 px-3 font-semibold hidden sm:table-cell">Teams</th>
                <th className="text-center py-2.5 px-3 font-semibold">NTRP</th>
                <th className="text-center py-2.5 px-3 font-semibold">S-ELO</th>
                <th className="text-center py-2.5 px-3 font-semibold">D-ELO</th>
                <th className="text-center py-2.5 px-3 font-semibold">TR</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-2.5 px-3">
                    <Link href={`/player/${p.id}`} className="font-medium text-primary-light hover:underline">
                      {p.name}
                    </Link>
                    <div className="flex flex-wrap gap-1 mt-0.5 sm:hidden">
                      {p.teams.split(",").map((team) => (
                        <span key={team} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {team.replace(/\s*\d{4}$/, "").trim()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {p.teams.split(",").map((team) => (
                        <span key={team} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {team.replace(/\s*\d{4}$/, "").trim()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs">{p.ntrp_type}</td>
                  <td className="py-2.5 px-3 text-center text-xs font-semibold">
                    {p.singles_elo === 1500 ? "—" : p.singles_elo}
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs font-semibold">
                    {p.doubles_elo === 1500 ? "—" : p.doubles_elo}
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs font-mono text-slate-500">
                    {p.tennisrecord_rating != null ? (
                      <a
                        href={`https://www.tennisrecord.com/adult/profile.aspx?playername=${encodeURIComponent(p.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-700 dark:text-sky-400 hover:underline"
                      >
                        {p.tennisrecord_rating.toFixed(2)}
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    No players found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
