import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import ical, { ICalCalendarMethod, ICalEventStatus } from "ical-generator";

const TZ = "America/Los_Angeles";

interface Params {
  params: Promise<{ token: string }>;
}

function localTime(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}:00`;
}

function addHours(dateStr: string, timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const endH = h + hours;
  const endTime = `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return `${dateStr}T${endTime}:00`;
}

const POSITION_LABELS: Record<string, string> = {
  D1A: "Doubles 1", D1B: "Doubles 1", D2A: "Doubles 2", D2B: "Doubles 2",
  D3A: "Doubles 3", D3B: "Doubles 3", S1: "Singles 1", S2: "Singles 2",
};

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = await getDB();

  const player = await db.prepare("SELECT id, name FROM players WHERE ics_token = ?")
    .bind(token).first<{ id: string; name: string }>();

  if (!player) {
    return new NextResponse("Invalid feed token", { status: 404 });
  }

  const cal = ical({
    name: "Framers",
    prodId: { company: "Greenbrook Framers", product: "Calendar Feed" },
    method: ICalCalendarMethod.PUBLISH,
    timezone: TZ,
    x: [
      { key: "X-WR-CALNAME", value: "Framers" },
      { key: "X-WR-TIMEZONE", value: TZ },
    ],
  });

  // League matches + lineup data for this player
  const teamMatches = (await db.prepare(
    `SELECT lm.id, lm.match_date, lm.match_time, lm.opponent_team, lm.location,
            lm.is_home, lm.status, lm.team_score, lm.notes, lm.usta_url,
            t.name as team_name, t.slug as team_slug,
            a.status as rsvp_status,
            l.id as lineup_id, l.status as lineup_status
     FROM league_matches lm
     JOIN teams t ON t.id = lm.team_id
     JOIN team_memberships tm ON tm.team_id = t.id AND tm.player_id = ?
     LEFT JOIN availability a ON a.match_id = lm.id AND a.player_id = ?
     LEFT JOIN lineups l ON l.match_id = lm.id
     ORDER BY lm.match_date`
  ).bind(player.id, player.id).all()).results as Array<{
    id: string; match_date: string; match_time: string | null; opponent_team: string;
    location: string | null; is_home: number; status: string; team_score: string | null;
    notes: string | null; usta_url: string | null;
    team_name: string; team_slug: string; rsvp_status: string | null;
    lineup_id: string | null; lineup_status: string | null;
  }>;

  // Batch-fetch all lineup slots for matches that have lineups
  const lineupIds = teamMatches.map((m) => m.lineup_id).filter(Boolean) as string[];
  const allSlots = lineupIds.length > 0
    ? (await db.prepare(
        `SELECT ls.lineup_id, ls.position, ls.player_id, ls.is_alternate, p.name as player_name
         FROM lineup_slots ls
         JOIN players p ON p.id = ls.player_id
         WHERE ls.lineup_id IN (${lineupIds.map(() => "?").join(",")})
         ORDER BY ls.position`
      ).bind(...lineupIds).all<{
        lineup_id: string; position: string; player_id: string; is_alternate: number; player_name: string;
      }>()).results
    : [];

  const slotsByLineup = new Map<string, typeof allSlots>();
  for (const slot of allSlots) {
    const arr = slotsByLineup.get(slot.lineup_id) ?? [];
    arr.push(slot);
    slotsByLineup.set(slot.lineup_id, arr);
  }

  for (const m of teamMatches) {
    const time = m.match_time || "18:00";
    const venue = m.is_home ? "Greenbrook (Home)" : `Away - ${m.opponent_team}`;
    const matchUrl = `https://framers.app/team/${m.team_slug}/match/${m.id}`;

    const slots = m.lineup_id ? (slotsByLineup.get(m.lineup_id) ?? []) : [];
    const mySlots = slots.filter((s) => s.player_id === player.id && s.is_alternate === 0);
    const lineupConfirmed = m.lineup_status === "confirmed" || m.lineup_status === "locked";
    const inLineup = mySlots.length > 0 && lineupConfirmed;

    // Title: HOLD → Confirmed with position → Completed with score
    let summary: string;
    if (m.status === "completed") {
      summary = `${m.team_name} vs ${m.opponent_team}${m.team_score ? ` (${m.team_score})` : ""}`;
    } else if (inLineup) {
      const pos = mySlots.map((s) => POSITION_LABELS[s.position] || s.position).join(", ");
      summary = `${m.team_name} vs ${m.opponent_team} — ${pos}`;
    } else if (lineupConfirmed) {
      summary = `${m.team_name} vs ${m.opponent_team} (not in lineup)`;
    } else {
      summary = `HOLD: ${m.team_name} vs ${m.opponent_team}`;
    }

    // Status: player in lineup or completed = CONFIRMED, cancelled = CANCELLED, else TENTATIVE
    const status = m.status === "cancelled" ? ICalEventStatus.CANCELLED
      : (m.status === "completed" || inLineup) ? ICalEventStatus.CONFIRMED
      : ICalEventStatus.TENTATIVE;

    // Build description
    const descParts: string[] = [`USTA League Match — ${venue}`];
    if (m.rsvp_status) descParts.push(`Your RSVP: ${m.rsvp_status}`);
    if (m.team_score) descParts.push(`Result: ${m.team_score}`);
    if (m.notes) descParts.push(`\nNotes: ${m.notes}`);

    if (lineupConfirmed && slots.length > 0) {
      descParts.push("\nLineup:");
      const starters = slots.filter((s) => s.is_alternate === 0);
      for (const s of starters) {
        const label = POSITION_LABELS[s.position] || s.position;
        const me = s.player_id === player.id ? " ← you" : "";
        descParts.push(`  ${label} (${s.position}): ${s.player_name}${me}`);
      }
      const alts = slots.filter((s) => s.is_alternate === 1);
      if (alts.length > 0) {
        descParts.push(`  Alternates: ${alts.map((s) => s.player_name).join(", ")}`);
      }
    }

    if (m.usta_url) descParts.push(`\nUSTA Scorecard: ${m.usta_url}`);
    descParts.push(`\nView: ${matchUrl}`);

    cal.createEvent({
      id: `league-${m.id}@framers.app`,
      start: localTime(m.match_date, time),
      timezone: TZ,
      end: addHours(m.match_date, time, 3),
      summary,
      description: descParts.join("\n"),
      location: m.location || venue,
      status,
      url: matchUrl,
    });
  }

  // Tournament matches
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
    const time = m.scheduled_time || "18:00";
    const opponent = m.opponent_name || "TBD";

    const status = m.status === "completed" ? ICalEventStatus.CONFIRMED
      : m.status === "cancelled" ? ICalEventStatus.CANCELLED
      : ICalEventStatus.TENTATIVE;

    cal.createEvent({
      id: `tourney-${m.id}@framers.app`,
      start: localTime(m.scheduled_date, time),
      timezone: TZ,
      end: addHours(m.scheduled_date, time, 2),
      summary: `${m.tourney_name}: vs ${opponent}`,
      description: `Tournament Match\nCourt: ${m.court || "TBD"}\n\nView: https://framers.app/tournament/${m.tourney_slug}`,
      location: m.court ? `Court ${m.court}` : "Greenbrook Tennis Courts",
      status,
      url: `https://framers.app/tournament/${m.tourney_slug}`,
    });
  }

  // Practice sessions
  const practices = (await db.prepare(
    `SELECT ps.id, ps.session_date, ps.start_time, ps.end_time, ps.location, ps.title, ps.cancelled,
            pr.status as my_rsvp
     FROM practice_sessions ps
     LEFT JOIN practice_rsvp pr ON pr.session_id = ps.id AND pr.player_id = ?
     ORDER BY ps.session_date`
  ).bind(player.id).all()).results as Array<{
    id: string; session_date: string; start_time: string; end_time: string;
    location: string; title: string; cancelled: number; my_rsvp: string | null;
  }>;

  for (const p of practices) {
    const startStr = localTime(p.session_date, p.start_time);
    const endStr = localTime(p.session_date, p.end_time);
    const rsvp = p.my_rsvp ? ` | Your RSVP: ${p.my_rsvp}` : "";

    cal.createEvent({
      id: `practice-${p.id}@framers.app`,
      start: startStr,
      timezone: TZ,
      end: endStr,
      summary: p.title,
      description: `${p.title}${rsvp}\n\nRSVP: https://framers.app/practice/${p.id}`,
      location: p.location,
      status: p.cancelled ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
      url: `https://framers.app/practice/${p.id}`,
    });
  }

  return new NextResponse(cal.toString(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    },
  });
}
