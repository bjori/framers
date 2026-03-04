import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LineupGenerator } from "@/components/lineup-generator";
import { LineupEditor } from "@/components/lineup-editor";
import { MatchRsvp } from "@/components/match-rsvp";
import { MatchDetailsEditor } from "@/components/match-details-editor";
import { LineupAcknowledge } from "@/components/lineup-acknowledge";

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
  acknowledged: number | null;
  singles_elo: number;
  doubles_elo: number;
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
      notes: string | null;
    }>();
  if (!match) notFound();

  const format = JSON.parse(team.match_format || '{"singles":1,"doubles":3}');
  const formatLabel = `${format.singles} singles, ${format.doubles} doubles`;

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
          `SELECT ls.position, p.name as player_name, ls.player_id, ls.is_alternate, ls.acknowledged,
                  p.singles_elo, p.doubles_elo
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
        `SELECT lmr.position, lmr.won, lmr.our_score, lmr.opp_score, lmr.is_default_win,
                p1.name as player1_name, p2.name as player2_name
         FROM league_match_results lmr
         LEFT JOIN players p1 ON p1.id = lmr.player1_id
         LEFT JOIN players p2 ON p2.id = lmr.player2_id
         WHERE lmr.match_id = ?
         ORDER BY lmr.position`
      )
      .bind(id)
      .all<{ position: string; won: number | null; our_score: string | null; opp_score: string | null; is_default_win: number; player1_name: string | null; player2_name: string | null }>()
  ).results;

  const session = await getSession();
  const isAdmin = session?.is_admin === 1;
  const isPast = match.status === "completed";
  const yesCount = rsvps.filter((r) => r.status === "yes").length;
  const maybeCount = rsvps.filter((r) => r.status === "maybe").length;
  const neededPlayers = format.singles + format.doubles * 2;

  // Check co-captain role
  let isCaptain = false;
  if (session && !isAdmin) {
    const membership = await db.prepare(
      "SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?"
    ).bind(session.player_id, team.id).first<{ role: string }>();
    isCaptain = membership?.role === "captain" || membership?.role === "co-captain";
  }
  const canManage = isAdmin || isCaptain;

  // Query all active team members for the lineup editor's available-players pool
  const positionOrder: Record<string, number> = { S1: 0, S2: 1, D1A: 2, D1B: 3, D2A: 4, D2B: 5, D3A: 6, D3B: 7 };
  let editableSlots: { position: string; playerId: string | null; playerName: string | null; singlesElo: number; doublesElo: number; acknowledged: number | null; withdrawnName: string | null }[] = [];
  let poolPlayers: { id: string; name: string; singlesElo: number; doublesElo: number; rsvpStatus: string | null }[] = [];

  if (canManage && !isPast && lineup) {
    const teamMembers = (
      await db
        .prepare(
          `SELECT p.id, p.name, p.singles_elo, p.doubles_elo, a.status as rsvp_status
           FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm.team_id = ? AND tm.active = 1
           ORDER BY p.singles_elo DESC`
        )
        .bind(id, team.id)
        .all<{ id: string; name: string; singles_elo: number; doubles_elo: number; rsvp_status: string | null }>()
    ).results;

    editableSlots = lineupSlots
      .filter((s) => s.is_alternate === 0 || s.is_alternate === -1)
      .map((s) => ({
        position: s.position,
        playerId: s.is_alternate === -1 ? null : s.player_id,
        playerName: s.is_alternate === -1 ? null : s.player_name,
        singlesElo: s.is_alternate === -1 ? 0 : s.singles_elo,
        doublesElo: s.is_alternate === -1 ? 0 : s.doubles_elo,
        acknowledged: s.acknowledged,
        withdrawnName: s.is_alternate === -1 ? s.player_name : null,
      }))
      .sort((a, b) => (positionOrder[a.position] ?? 99) - (positionOrder[b.position] ?? 99));

    const activeStarterIds = new Set(
      lineupSlots.filter((s) => s.is_alternate === 0).map((s) => s.player_id)
    );
    poolPlayers = teamMembers
      .filter((m) => !activeStarterIds.has(m.id))
      .sort((a, b) => {
        const rsvpOrder = (s: string | null) => (s === "yes" ? 0 : s === "maybe" ? 1 : s === "no" ? 3 : 2);
        const diff = rsvpOrder(a.rsvp_status) - rsvpOrder(b.rsvp_status);
        return diff !== 0 ? diff : b.singles_elo - a.singles_elo;
      })
      .map((m) => ({
        id: m.id,
        name: m.name,
        singlesElo: m.singles_elo,
        doublesElo: m.doubles_elo,
        rsvpStatus: m.rsvp_status,
      }));
  }

  const myRsvp = session ? rsvps.find((r) => r.player_id === session.player_id)?.status ?? null : null;

  const matchDate = new Date(match.match_date + "T12:00:00");
  const dateStr = matchDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  function formatTime(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

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
          Round {match.round_number} · {dateStr}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Format: {formatLabel}</p>
        {isPast && match.team_score && (
          <p className={`text-2xl font-bold mt-2 ${match.team_result === "Won" ? "text-accent" : "text-danger"}`}>
            {match.team_score} — {match.team_result}
          </p>
        )}
      </div>

      {/* Match logistics */}
      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">When</p>
            <p className="text-sm font-medium">
              {match.match_time ? formatTime(match.match_time) : <span className="text-slate-400">TBD</span>}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Where</p>
            <p className="text-sm font-medium">
              {match.location || <span className="text-slate-400">TBD</span>}
            </p>
          </div>
        </div>
        {match.notes && (
          <div className="pt-1 border-t border-border">
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">Notes</p>
            <p className="text-sm whitespace-pre-line">{match.notes}</p>
          </div>
        )}
        {canManage && !isPast && (
          <div className="pt-1">
            <MatchDetailsEditor
              slug={slug}
              matchId={id}
              currentTime={match.match_time}
              currentLocation={match.location}
              currentNotes={match.notes}
            />
          </div>
        )}
      </div>

      {/* My RSVP */}
      {session && !isPast && (
        <MatchRsvp slug={slug} matchId={id} currentStatus={myRsvp} />
      )}

      {/* Line Results */}
      {results.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Line Results</h2>
          <div className="bg-surface-alt rounded-xl border border-border overflow-hidden divide-y divide-border">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    {r.position}
                    {r.is_default_win ? <span className="ml-1 text-warning">(Default)</span> : ""}
                  </p>
                  <p className="text-sm font-medium">
                    {r.player1_name}{r.player2_name ? ` / ${r.player2_name}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  {r.our_score && r.opp_score && (
                    <span className={`font-bold ${r.won ? "text-accent" : "text-danger"}`}>
                      {r.our_score.split(",").map((s, si) =>
                        `${s}-${r.opp_score!.split(",")[si] ?? ""}`
                      ).join(", ")}
                    </span>
                  )}
                  <span className={`block text-[10px] font-bold uppercase ${r.won ? "text-accent" : "text-danger"}`}>
                    {r.is_default_win === 1 ? "Default Win" : r.won ? "Won" : "Lost"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lineup — unified view for captains (editor with view/edit toggle) */}
      {canManage && !isPast && lineup && editableSlots.length > 0 && (
        <>
          <LineupEditor slug={slug} matchId={id} slots={editableSlots} poolPlayers={poolPlayers} lineupStatus={lineup.status} />
          {(() => {
            const mySlot = session && lineup.status === "confirmed"
              ? lineupSlots.find((s) => s.player_id === session.player_id && s.is_alternate === 0)
              : null;
            if (!mySlot) return null;
            return (
              <div className="mt-3">
                <LineupAcknowledge slug={slug} matchId={id} position={mySlot.position} currentAck={mySlot.acknowledged} />
              </div>
            );
          })()}
        </>
      )}

      {/* Lineup — read-only for non-captains and past matches */}
      {lineup && lineupSlots.length > 0 && (!canManage || isPast) && (
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
            {lineupSlots.filter((s) => s.is_alternate === 0 || s.is_alternate === -1).map((s) => (
              <div key={s.position} className={`flex items-center justify-between px-4 py-3 ${s.is_alternate === -1 ? "bg-danger/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-slate-400 w-8">{s.position}</span>
                  <Link href={`/player/${s.player_id}`} className={`font-medium text-sm hover:underline ${s.is_alternate === -1 ? "line-through text-slate-400" : "text-primary-light"}`}>
                    {s.player_name}
                  </Link>
                  {s.is_alternate === -1 && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-danger/10 text-danger">Withdrawn</span>
                  )}
                </div>
                {lineup!.status === "confirmed" && s.is_alternate === 0 && (
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    s.acknowledged === 1 ? "bg-accent/10 text-accent" :
                    s.acknowledged === 0 ? "bg-danger/10 text-danger" :
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}>
                    {s.acknowledged === 1 ? "Confirmed" : s.acknowledged === 0 ? "Declined" : "Pending"}
                  </span>
                )}
              </div>
            ))}
            {lineupSlots.filter((s) => s.is_alternate === 1).length > 0 && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs font-semibold text-slate-400 mb-1">Alternates</p>
                {lineupSlots.filter((s) => s.is_alternate === 1).map((s) => (
                  <p key={s.position} className="text-sm">{s.player_name}</p>
                ))}
              </div>
            )}
          </div>
          {(() => {
            const mySlot = session && lineup.status === "confirmed" && !isPast
              ? lineupSlots.find((s) => s.player_id === session.player_id && s.is_alternate === 0)
              : null;
            if (!mySlot) return null;
            return (
              <div className="mt-3">
                <LineupAcknowledge slug={slug} matchId={id} position={mySlot.position} currentAck={mySlot.acknowledged} />
              </div>
            );
          })()}
        </section>
      )}

      {/* Lineup Generator — only for first-time lineup creation */}
      {canManage && !isPast && !lineup && (
        <LineupGenerator slug={slug} matchId={id} />
      )}

      {/* Availability — hidden for captains when lineup exists (editor pool replaces it) */}
      {!(canManage && !isPast && lineup) && (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Availability
            <span className="text-sm font-normal text-slate-500 ml-2">
              {yesCount} yes{yesCount < neededPlayers ? <span className="text-danger"> (need {neededPlayers})</span> : ""}, {maybeCount} maybe
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
      )}
    </div>
  );
}
