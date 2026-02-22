import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = await getDB();

  const player = await db.prepare("SELECT id, name FROM players WHERE ics_token = ?")
    .bind(token).first<{ id: string; name: string }>();

  if (!player) {
    return new NextResponse("Invalid feed token", { status: 404 });
  }

  const cal = ical({
    name: `Greenbrook Framers - ${player.name}`,
    prodId: { company: "Greenbrook Framers", product: "Calendar Feed" },
    method: ICalCalendarMethod.PUBLISH,
  });

  const teamMatches = (await db.prepare(
    `SELECT lm.id, lm.match_date, lm.match_time, lm.opponent_team, lm.location, lm.is_home, lm.status, lm.team_score,
            t.name as team_name, t.slug as team_slug,
            a.status as rsvp_status
     FROM league_matches lm
     JOIN teams t ON t.id = lm.team_id
     JOIN team_memberships tm ON tm.team_id = t.id AND tm.player_id = ?
     LEFT JOIN availability a ON a.match_id = lm.id AND a.player_id = ?
     ORDER BY lm.match_date`
  ).bind(player.id, player.id).all()).results as Array<{
    id: string; match_date: string; match_time: string | null; opponent_team: string;
    location: string | null; is_home: number; status: string; team_score: string | null;
    team_name: string; team_slug: string; rsvp_status: string | null;
  }>;

  for (const m of teamMatches) {
    const date = new Date(m.match_date + "T" + (m.match_time || "09:00") + ":00");
    const venue = m.is_home ? "Greenbrook (Home)" : `Away - ${m.opponent_team}`;
    const rsvp = m.rsvp_status ? ` | Your RSVP: ${m.rsvp_status}` : "";
    const score = m.team_score ? ` | Result: ${m.team_score}` : "";

    const status = m.status === "completed" ? ICalEventStatus.CONFIRMED
      : m.status === "cancelled" ? ICalEventStatus.CANCELLED
      : ICalEventStatus.TENTATIVE;

    cal.createEvent({
      id: `league-${m.id}@framers.app`,
      start: date,
      end: new Date(date.getTime() + 3 * 60 * 60 * 1000),
      summary: `${m.team_name} vs ${m.opponent_team}`,
      description: `USTA League Match\n${venue}${rsvp}${score}\n\nView: https://framers.app/team/${m.team_slug}`,
      location: m.location || venue,
      status,
      url: `https://framers.app/team/${m.team_slug}/match/${m.id}`,
    });
  }

  const tournamentMatches = (await db.prepare(
    `SELECT tm.id, tm.scheduled_date, tm.scheduled_time, tm.court, tm.status, tm.score1_sets, tm.score2_sets,
            t.name as tourney_name, t.slug as tourney_slug,
            p2.name as opponent_name,
            tp.player_id as my_participant
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     JOIN tournament_participants tp ON (tp.id = tm.participant1_id OR tp.id = tm.participant2_id) AND tp.player_id = ?
     LEFT JOIN tournament_participants tp2 ON tp2.id = CASE WHEN tp.id = tm.participant1_id THEN tm.participant2_id ELSE tm.participant1_id END
     LEFT JOIN players p2 ON p2.id = tp2.player_id
     WHERE tm.bye = 0
     ORDER BY tm.scheduled_date`
  ).bind(player.id).all()).results as Array<{
    id: string; scheduled_date: string | null; scheduled_time: string | null; court: string | null;
    status: string; score1_sets: string | null; score2_sets: string | null;
    tourney_name: string; tourney_slug: string; opponent_name: string | null; my_participant: string;
  }>;

  for (const m of tournamentMatches) {
    if (!m.scheduled_date) continue;
    const date = new Date(m.scheduled_date + "T" + (m.scheduled_time || "09:00") + ":00");
    const opponent = m.opponent_name || "TBD";

    const status = m.status === "completed" ? ICalEventStatus.CONFIRMED
      : m.status === "cancelled" ? ICalEventStatus.CANCELLED
      : ICalEventStatus.TENTATIVE;

    cal.createEvent({
      id: `tourney-${m.id}@framers.app`,
      start: date,
      end: new Date(date.getTime() + 2 * 60 * 60 * 1000),
      summary: `${m.tourney_name}: vs ${opponent}`,
      description: `Tournament Match\nCourt: ${m.court || "TBD"}\n\nView: https://framers.app/tournament/${m.tourney_slug}`,
      location: m.court ? `Court ${m.court}` : "Greenbrook Tennis Courts",
      status,
      url: `https://framers.app/tournament/${m.tourney_slug}`,
    });
  }

  return new NextResponse(cal.toString(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="framers-${player.name.toLowerCase().replace(/\s+/g, "-")}.ics"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
