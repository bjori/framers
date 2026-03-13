import { getDB } from "@/lib/db";
import { notFound } from "next/navigation";
import { TournamentTabs } from "@/components/tournament-tabs";
import type { TournamentMatch } from "@/components/tournament-schedule";

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

function parseScore(s: string | null): number[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function computeStandings(matches: TournamentMatch[], participants: { id: string; player_id: string; name: string; singles_elo: number }[]): Standing[] {
  const map = new Map<string, Standing>();
  for (const p of participants) {
    map.set(p.id, {
      participant_id: p.id,
      player_id: p.player_id,
      name: p.name,
      elo: p.singles_elo,
      matches: 0, wins: 0, losses: 0,
      setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_participant_id) continue;

    const s1 = parseScore(m.score1_sets);
    const s2 = parseScore(m.score2_sets);

    const p1 = map.get(m.participant1_id);
    const p2 = map.get(m.participant2_id);
    if (!p1 || !p2) continue;

    p1.matches++;
    p2.matches++;

    if (m.winner_participant_id === m.participant1_id) {
      p1.wins++;
      p2.losses++;
    } else {
      p2.wins++;
      p1.losses++;
    }

    let p1SetsWon = 0, p2SetsWon = 0;
    for (let i = 0; i < s1.length; i++) {
      const g1 = s1[i] ?? 0;
      const g2 = s2[i] ?? 0;
      p1.gamesWon += g1;
      p1.gamesLost += g2;
      p2.gamesWon += g2;
      p2.gamesLost += g1;
      if (g1 > g2) p1SetsWon++;
      else if (g2 > g1) p2SetsWon++;
    }
    p1.setsWon += p1SetsWon;
    p1.setsLost += p2SetsWon;
    p2.setsWon += p2SetsWon;
    p2.setsLost += p1SetsWon;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.setsWon - b.setsLost !== a.setsWon - a.setsLost) return (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost);
    return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
  });
}

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDB();

  const tournament = await db
    .prepare("SELECT * FROM tournaments WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; name: string; slug: string; format: string; match_type: string; status: string; start_date: string; end_date: string }>();

  if (!tournament) notFound();

  const isDoubles = tournament.match_type === "doubles";

  const participants = (
    await db
      .prepare(
        `SELECT tp.id, tp.player_id, p.name, p.singles_elo, p.doubles_elo,
                tp.partner_id, p2.name as partner_name
         FROM tournament_participants tp
         JOIN players p ON p.id = tp.player_id
         LEFT JOIN players p2 ON p2.id = tp.partner_id
         WHERE tp.tournament_id = ?
         ORDER BY p.name`
      )
      .bind(tournament.id)
      .all<{ id: string; player_id: string; name: string; singles_elo: number; doubles_elo: number; partner_id: string | null; partner_name: string | null }>()
  ).results;

  const rawMatches = (
    await db
      .prepare(
        `SELECT tm.*,
                p1.name as p1_name, tp1.player_id as p1_player_id,
                p2.name as p2_name, tp2.player_id as p2_player_id,
                p1partner.name as p1_partner_name, p2partner.name as p2_partner_name
         FROM tournament_matches tm
         LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
         LEFT JOIN players p1 ON p1.id = tp1.player_id
         LEFT JOIN players p1partner ON p1partner.id = tp1.partner_id
         LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
         LEFT JOIN players p2 ON p2.id = tp2.player_id
         LEFT JOIN players p2partner ON p2partner.id = tp2.partner_id
         WHERE tm.tournament_id = ?
         ORDER BY tm.week ASC, tm.scheduled_date ASC, tm.scheduled_time ASC`
      )
      .bind(tournament.id)
      .all<TournamentMatch & { p1_partner_name: string | null; p2_partner_name: string | null }>()
  ).results;

  const matches: TournamentMatch[] = rawMatches.map((m) => ({
    ...m,
    p1_name: m.p1_partner_name ? `${m.p1_name} / ${m.p1_partner_name}` : m.p1_name,
    p2_name: m.p2_partner_name ? `${m.p2_name} / ${m.p2_partner_name}` : m.p2_name,
  }));

  const standingsParticipants = participants.map((p) => ({
    ...p,
    name: p.partner_name ? `${p.name} / ${p.partner_name}` : p.name,
    singles_elo: isDoubles ? p.doubles_elo : p.singles_elo,
  }));
  const standings = computeStandings(matches, standingsParticipants);

  const completedCount = matches.filter((m) => m.status === "completed").length;
  const totalCount = matches.filter((m) => !m.bye).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {tournament.format.replace("_", " ")} &middot; {tournament.match_type} &middot; {completedCount}/{totalCount} matches completed
        </p>
      </div>

      <TournamentTabs
        slug={slug}
        matches={matches}
        standings={standings}
        isDoubles={isDoubles}
      />
    </div>
  );
}
