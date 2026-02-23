import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TournamentMatchDetail } from "@/components/tournament-match-detail";

export default async function TournamentMatchPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const db = await getDB();
  const session = await getSession();

  const tournament = await db
    .prepare("SELECT id, name, slug FROM tournaments WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; name: string; slug: string }>();
  if (!tournament) notFound();

  const match = await db
    .prepare(
      `SELECT tm.*,
              p1.name as p1_name, tp1.player_id as p1_player_id,
              p1.email as p1_email, p1.phone as p1_phone,
              p2.name as p2_name, tp2.player_id as p2_player_id,
              p2.email as p2_email, p2.phone as p2_phone,
              p1partner.name as p1_partner_name,
              p2partner.name as p2_partner_name
       FROM tournament_matches tm
       LEFT JOIN tournament_participants tp1 ON tp1.id = tm.participant1_id
       LEFT JOIN players p1 ON p1.id = tp1.player_id
       LEFT JOIN players p1partner ON p1partner.id = tp1.partner_id
       LEFT JOIN tournament_participants tp2 ON tp2.id = tm.participant2_id
       LEFT JOIN players p2 ON p2.id = tp2.player_id
       LEFT JOIN players p2partner ON p2partner.id = tp2.partner_id
       WHERE tm.id = ? AND tm.tournament_id = ?`
    )
    .bind(id, tournament.id)
    .first<{
      id: string; week: number; round: number; match_number: number;
      participant1_id: string; participant2_id: string;
      winner_participant_id: string | null;
      score1_sets: string | null; score2_sets: string | null;
      scheduled_date: string; scheduled_time: string; court: string;
      status: string; bye: number; is_forfeit: number;
      p1_name: string; p1_player_id: string; p1_email: string; p1_phone: string | null;
      p2_name: string; p2_player_id: string; p2_email: string; p2_phone: string | null;
      p1_partner_name: string | null; p2_partner_name: string | null;
    }>();

  if (!match) notFound();

  const p1Display = match.p1_partner_name ? `${match.p1_name} / ${match.p1_partner_name}` : match.p1_name;
  const p2Display = match.p2_partner_name ? `${match.p2_name} / ${match.p2_partner_name}` : match.p2_name;

  const isParticipant = session && (
    session.player_id === match.p1_player_id ||
    session.player_id === match.p2_player_id ||
    session.is_admin === 1
  );

  const isCompleted = match.status === "completed";

  function parseScore(s: string | null): number[] {
    if (!s) return [];
    try { return JSON.parse(s); } catch { return []; }
  }

  const s1 = parseScore(match.score1_sets);
  const s2 = parseScore(match.score2_sets);
  const isP1Winner = match.winner_participant_id === match.participant1_id;

  const dateStr = match.scheduled_date
    ? new Date(match.scheduled_date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : "TBD";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/tournament/${slug}`} className="text-xs text-primary-light hover:underline mb-2 inline-block">
          &larr; {tournament.name}
        </Link>
        <p className="text-xs text-slate-400 uppercase font-bold">Week {match.week}</p>
        <h1 className="text-xl font-bold mt-1">
          <span className={match.winner_participant_id === match.participant1_id ? "text-accent" : ""}>{p1Display}</span>
          <span className="text-slate-400 mx-2">vs</span>
          <span className={match.winner_participant_id === match.participant2_id ? "text-accent" : ""}>{p2Display}</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {dateStr}
          {match.scheduled_time ? ` at ${match.scheduled_time}` : ""}
          {match.court ? ` · ${match.court}` : ""}
        </p>
        {match.is_forfeit === 1 && (
          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-danger/10 text-danger">Forfeit</span>
        )}
      </div>

      {/* Score display */}
      {isCompleted && s1.length > 0 && (
        <section className="bg-surface-alt rounded-xl border border-border p-5">
          <div className="text-center space-y-3">
            <p className="text-xs font-bold uppercase text-slate-400">Final Score</p>
            <div className="flex items-center justify-center gap-6">
              {s1.map((g1, i) => {
                const g2 = s2[i] ?? 0;
                const winG = isP1Winner ? g1 : g2;
                const loseG = isP1Winner ? g2 : g1;
                return (
                  <div key={i} className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Set {i + 1}</p>
                    <p className="text-2xl font-bold">
                      <span className="text-accent">{winG}</span>
                      <span className="text-slate-300 dark:text-slate-600 mx-1">-</span>
                      <span className="text-slate-500">{loseG}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-sm font-semibold">
              Winner: <span className="text-accent">{isP1Winner ? p1Display : p2Display}</span>
            </p>
          </div>
        </section>
      )}

      {/* Contact info */}
      <section className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Players</h2>
        {[
          { name: p1Display, email: match.p1_email, phone: match.p1_phone, playerId: match.p1_player_id },
          { name: p2Display, email: match.p2_email, phone: match.p2_phone, playerId: match.p2_player_id },
        ].map((p) => (
          <div key={p.playerId} className="flex items-center gap-3">
            <Link href={`/player/${p.playerId}`} className="font-medium text-sm text-primary-light hover:underline">
              {p.name}
            </Link>
            <div className="flex items-center gap-1.5 text-slate-400">
              {p.phone && (
                <a href={`tel:${p.phone}`} className="hover:text-primary-light text-xs" title={p.phone}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="hover:text-primary-light text-xs" title={p.email}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </a>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Score entry + Reschedule (client component) */}
      {isParticipant && (
        <TournamentMatchDetail
          match={{
            id: match.id,
            participant1_id: match.participant1_id,
            participant2_id: match.participant2_id,
            winner_participant_id: match.winner_participant_id,
            score1_sets: match.score1_sets,
            score2_sets: match.score2_sets,
            scheduled_date: match.scheduled_date,
            scheduled_time: match.scheduled_time,
            court: match.court,
            status: match.status,
            p1_name: p1Display,
            p2_name: p2Display,
            p1_player_id: match.p1_player_id,
            p2_player_id: match.p2_player_id,
            p1_email: match.p1_email,
            p1_phone: match.p1_phone,
            p2_email: match.p2_email,
            p2_phone: match.p2_phone,
          }}
          slug={slug}
        />
      )}
    </div>
  );
}
