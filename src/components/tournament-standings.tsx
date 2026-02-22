"use client";

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

export function TournamentStandings({ standings }: { standings: Standing[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Standings</h2>
      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left py-2.5 px-3 font-semibold">#</th>
                <th className="text-left py-2.5 px-3 font-semibold">Player</th>
                <th className="text-center py-2.5 px-3 font-semibold">W</th>
                <th className="text-center py-2.5 px-3 font-semibold">L</th>
                <th className="text-center py-2.5 px-3 font-semibold hidden sm:table-cell">Sets</th>
                <th className="text-center py-2.5 px-3 font-semibold hidden sm:table-cell">Games</th>
                <th className="text-center py-2.5 px-3 font-semibold">ELO</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.participant_id} className="border-b border-border last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 text-slate-500">{i + 1}</td>
                  <td className="py-2.5 px-3 font-medium">
                    <a href={`/player/${s.player_id}`} className="text-primary-light hover:underline">
                      {s.name}
                    </a>
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-accent">{s.wins}</td>
                  <td className="py-2.5 px-3 text-center text-slate-500">{s.losses}</td>
                  <td className="py-2.5 px-3 text-center hidden sm:table-cell">{s.setsWon}-{s.setsLost}</td>
                  <td className="py-2.5 px-3 text-center hidden sm:table-cell">{s.gamesWon}-{s.gamesLost}</td>
                  <td className="py-2.5 px-3 text-center text-xs font-semibold">{s.elo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
