"use client";

interface AvailabilityEntry {
  player_name: string;
  player_id: string;
  match_id: string;
  status: string | null;
}

interface Match {
  id: string;
  match_date: string;
  opponent_team: string;
}

interface Props {
  roster: { player_id: string; name: string }[];
  matches: Match[];
  availability: AvailabilityEntry[];
}

function statusIcon(status: string | null): string {
  switch (status) {
    case "yes": return "\u2705";
    case "maybe": return "\u2753";
    case "no": return "\u274C";
    default: return "\u2014";
  }
}

function statusColor(status: string | null): string {
  switch (status) {
    case "yes": return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
    case "maybe": return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
    case "no": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
    default: return "bg-slate-50 dark:bg-slate-800/50 text-slate-400";
  }
}

export default function AvailabilityGrid({ roster, matches, availability, neededPlayers = 7 }: Props & { neededPlayers?: number }) {
  const avMap = new Map<string, string>();
  for (const a of availability) {
    avMap.set(`${a.player_id}:${a.match_id}`, a.status ?? "pending");
  }

  const openMatches = matches.filter((m) => m.match_date >= new Date().toISOString().slice(0, 10));
  const displayMatches = openMatches.length > 0 ? openMatches : matches.slice(-5);

  if (displayMatches.length === 0) return null;

  const yesCount = (matchId: string) => {
    let c = 0;
    for (const p of roster) {
      if (avMap.get(`${p.player_id}:${matchId}`) === "yes") c++;
    }
    return c;
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Availability</h2>
      <div className="bg-surface-alt rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-slate-500 sticky left-0 bg-surface-alt z-10 min-w-[120px]">
                Player
              </th>
              {displayMatches.map((m) => (
                <th key={m.id} className="px-2 py-2 text-center font-medium text-slate-500 min-w-[60px]">
                  <div className="text-[10px] leading-tight">
                    {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div className="text-[9px] text-slate-400 truncate max-w-[60px]">{m.opponent_team.split(" ")[0]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <tr key={p.player_id} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-medium text-xs sticky left-0 bg-surface-alt z-10 whitespace-nowrap">
                  {p.name.split(" ")[0]}
                </td>
                {displayMatches.map((m) => {
                  const status = avMap.get(`${p.player_id}:${m.id}`) ?? null;
                  return (
                    <td key={m.id} className="px-2 py-1.5 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs ${statusColor(status)}`}>
                        {statusIcon(status)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-border">
              <td className="px-3 py-1.5 font-semibold text-xs sticky left-0 bg-surface-alt z-10">Available</td>
              {displayMatches.map((m) => {
                const yes = yesCount(m.id);
                const color = yes >= neededPlayers ? "text-accent" : yes >= neededPlayers - 2 ? "text-warning" : "text-danger";
                return (
                  <td key={m.id} className={`px-2 py-1.5 text-center font-bold text-xs ${color}`}>
                    {yes}/{roster.length}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
