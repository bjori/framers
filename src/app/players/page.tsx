export const dynamic = "force-dynamic";

import { getDB } from "@/lib/db";
import { PlayerDirectory } from "@/components/player-directory";

interface PlayerRow {
  id: string;
  name: string;
  ntrp_type: string;
  singles_elo: number;
  doubles_elo: number;
  teams: string;
}

export default async function PlayersPage() {
  const db = await getDB();

  const players = (
    await db
      .prepare(
        `SELECT p.id, p.name, p.ntrp_type, p.singles_elo, p.doubles_elo,
                GROUP_CONCAT(DISTINCT t.name) as teams
         FROM players p
         JOIN team_memberships tm ON tm.player_id = p.id AND tm.active = 1
         JOIN teams t ON t.id = tm.team_id AND t.status IN ('active', 'upcoming')
         GROUP BY p.id
         ORDER BY p.name`
      )
      .all<PlayerRow>()
  ).results;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {players.length} active players across all teams
        </p>
      </div>
      <PlayerDirectory players={players} />
    </div>
  );
}
