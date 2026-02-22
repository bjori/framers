import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LineupGenerator } from "@/components/lineup-generator";

interface RsvpResponse {
  player_id: string;
  name: string;
  status: string;
  ntrp_type: string;
  singles_elo: number;
}

interface LineupSlotRow {
  position: string;
  player_name: string;
  player_id: string;
  is_alternate: number;
}

export default async function MatchDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const db = await getDB();

  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?").bind(slug)
    .first<{ id: string; name: string; slug: string; league: string; match_format: string }>();
  if (!team) notFound();

  const match = await db.prepare("SELECT * FROM league_matches WHERE id = ? AND team_id = ?").bind(id, team.id)
    .first<{
      id: string; round_number: number; opponent_team: string; match_date: string;
      match_time: string | null; location: string | null; is_home: number;
      team_result: string | null; team_score: string | null; status: string;
    }>();
  if (!match) notFound();

  const rsvps = (
    await db
      .prepare(
        `SELECT a.player_id, a.status, p.name, p.ntrp_type, p.singles_elo
         FROM availability a
         JOIN players p ON p.id = a.player_id
         WHERE a.match_id = ?
         ORDER BY
           CASE a.status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'no' THEN 2 END,
           p.singles_elo DESC`
      )
      .bind(id)
      .all<RsvpResponse>()
  ).results;

  const lineup = await db.prepare("SELECT * FROM lineups WHERE match_id = ?").bind(id)
    .first<{ id: string; status: string; confirmed_at: string | null }>();

  let lineupSlots: LineupSlotRow[] = [];
  if (lineup) {
    lineupSlots = (
      await db
        .prepare(
          `SELECT ls.position, p.name as player_name, ls.player_id, ls.is_alternate
           FROM lineup_slots ls
           JOIN players p ON p.id = ls.player_id
           WHERE ls.lineup_id = ?
           ORDER BY ls.position`
        )
        .bind(lineup.id)
        .all<LineupSlotRow>()
    ).results;
  }

  const results = (
    await db
      .prepare(
        `SELECT lmr.position, lmr.won, lmr.our_score, lmr.opp_score,
                p1.name as player1_name, p2.name as player2_name
         FROM league_match_results lmr
         LEFT JOIN players p1 ON p1.id = lmr.player1_id
         LEFT JOIN players p2 ON p2.id = lmr.player2_id
         WHERE lmr.match_id = ?
         ORDER BY lmr.position`
      )
      .bind(id)
      .all<{ position: string; won: number | null; our_score: string | null; opp_score: string | null; player1_name: string | null; player2_name: string | null }>()
  ).results;

  const session = await getSession();
  const isAdmin = session?.is_admin === 1;
  const isPast = match.status === "completed";
  const yesCount = rsvps.filter((r) => r.status === "yes").length;
  const maybeCount = rsvps.filter((r) => r.status === "maybe").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/team/${slug}`} className="text-xs text-primary-light hover:underline mb-2 inline-block">
          &larr; {team.name}
        </Link>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            match.is_home ? "bg-accent/10 text-accent" : "bg-slate-200 dark:bg-slate-700 text-slate-500"
          }`}>
            {match.is_home ? "HOME" : "AWAY"}
          </span>
          <h1 className="text-xl font-bold">vs {match.opponent_team}</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Round {match.round_number} ·{" "}
          {new Date(match.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          {match.match_time ? ` at ${match.match_time}` : ""}
          {match.location ? ` · ${match.location}` : ""}
        </p>
        {isPast && match.team_score && (
          <p className={`text-2xl font-bold mt-2 ${match.team_result === "Won" ? "text-accent" : "text-danger"}`}>
            {match.team_score} — {match.team_result}
          </p>
        )}
      </div>

      {/* Line Results */}
      {results.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Line Results</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">{r.position}</p>
                  <p className="text-sm font-medium">
                    {r.player1_name}{r.player2_name ? ` / ${r.player2_name}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  {r.our_score && (
                    <span className={`font-bold ${r.won ? "text-accent" : "text-danger"}`}>
                      {r.our_score} - {r.opp_score}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lineup */}
      {lineup && lineupSlots.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Lineup
            <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
              lineup.status === "confirmed" ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
            }`}>
              {lineup.status}
            </span>
          </h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {lineupSlots.filter((s) => !s.is_alternate).map((s) => (
              <div key={s.position} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-slate-400 w-8">{s.position}</span>
                  <Link href={`/player/${s.player_id}`} className="font-medium text-sm text-primary-light hover:underline">
                    {s.player_name}
                  </Link>
                </div>
              </div>
            ))}
            {lineupSlots.filter((s) => s.is_alternate).length > 0 && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-semibold text-slate-400 mb-1">Alternates</p>
                {lineupSlots.filter((s) => s.is_alternate).map((s) => (
                  <p key={s.position} className="text-sm">{s.player_name}</p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Lineup Generator (admin only, non-completed matches) */}
      {isAdmin && !isPast && !lineup && (
        <LineupGenerator slug={slug} matchId={id} />
      )}

      {/* RSVP Responses */}
      <section>
        <h2 className="text-lg font-semibold mb-3">
          Availability
          <span className="text-sm font-normal text-slate-500 ml-2">
            {yesCount} yes, {maybeCount} maybe
          </span>
        </h2>
        {rsvps.length === 0 ? (
          <p className="text-sm text-slate-500">No responses yet.</p>
        ) : (
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {rsvps.map((r) => (
              <div key={r.player_id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    r.status === "yes" ? "bg-accent" : r.status === "maybe" ? "bg-warning" : "bg-danger"
                  }`} />
                  <Link href={`/player/${r.player_id}`} className="text-sm font-medium text-primary-light hover:underline">
                    {r.name}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{r.singles_elo}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    r.status === "yes" ? "bg-accent/10 text-accent" :
                    r.status === "maybe" ? "bg-warning/10 text-warning" :
                    "bg-danger/10 text-danger"
                  }`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
