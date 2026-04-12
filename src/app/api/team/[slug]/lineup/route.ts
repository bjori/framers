import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { optimizeLineup, type AvailablePlayer } from "@/lib/lineup-optimizer";
import { sendEmailBatch, emailTemplate, matchThreadHeaders, listSender } from "@/lib/email";
import { transitionMatch } from "@/lib/match-lifecycle";
import { track } from "@/lib/analytics";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await request.json()) as { matchId: string; action: "generate" | "confirm" | "save"; slots?: { position: string; playerId: string }[] };
  const db = await getDB();

  const team = await db.prepare("SELECT * FROM teams WHERE slug = ?").bind(slug)
    .first<{ id: string; match_format: string; min_matches_goal: number }>();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const isAdmin = session.is_admin === 1;
  const membership = await db.prepare(
    "SELECT role FROM team_memberships WHERE team_id = ? AND player_id = ?"
  ).bind(team.id, session.player_id).first<{ role: string }>();
  const isCaptain = membership?.role === "captain" || membership?.role === "co-captain";
  if (!isAdmin && !isCaptain) {
    return NextResponse.json({ error: "Admin/captain only" }, { status: 403 });
  }

  const match = await db.prepare("SELECT * FROM league_matches WHERE id = ? AND team_id = ?")
    .bind(body.matchId, team.id)
    .first<{ id: string }>();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const format = JSON.parse(team.match_format || '{"singles":1,"doubles":3}');

  if (body.action === "generate") {
    const available = (
      await db
        .prepare(
          `SELECT p.id, p.name, p.singles_elo as singlesElo, p.doubles_elo as doublesElo,
                  a.status as rsvp_status, a.is_before_deadline,
                  p.reliability_score,
                  (SELECT count(*) FROM lineup_slots ls
                   JOIN lineups l ON l.id = ls.lineup_id
                   JOIN league_matches lm ON lm.id = l.match_id
                   WHERE ls.player_id = p.id AND lm.team_id = ?) as matchesPlayed,
                  (SELECT count(*) FROM league_match_results lmr
                   JOIN league_matches lm2 ON lm2.id = lmr.match_id
                   WHERE (lmr.player1_id = p.id OR lmr.player2_id = p.id)
                     AND lm2.team_id = ? AND lmr.is_default_win = 1) as defaultWins,
                  COALESCE(tm2.preferences, '{}') as preferences
           FROM team_memberships tm2
           JOIN players p ON p.id = tm2.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm2.team_id = ? AND tm2.active = 1
             AND (a.status IS NULL OR a.status != 'no')`
        )
        .bind(team.id, team.id, body.matchId, team.id)
        .all<{
          id: string; name: string; singlesElo: number; doublesElo: number;
          rsvp_status: string | null; is_before_deadline: number;
          reliability_score: number; matchesPlayed: number; defaultWins: number; preferences: string;
        }>()
    ).results;

    const players: AvailablePlayer[] = available.map((p) => {
      const prefs = JSON.parse(p.preferences || "{}");
      let rsvpStatus: AvailablePlayer["rsvpStatus"] = "call_last";
      if (p.rsvp_status === "yes") rsvpStatus = "yes";
      else if (p.rsvp_status === "maybe") rsvpStatus = "maybe";
      else if (prefs.doublesOnly) rsvpStatus = "doubles_only";

      return {
        id: p.id,
        name: p.name,
        singlesElo: p.singlesElo,
        doublesElo: p.doublesElo,
        matchesPlayedThisSeason: p.matchesPlayed,
        defaultWinsThisSeason: p.defaultWins,
        minMatchesGoal: team.min_matches_goal,
        preferences: { doublesOnly: prefs.doublesOnly },
        rsvpStatus,
        rsvpBeforeDeadline: p.is_before_deadline === 1,
        reliabilityScore: p.reliability_score,
      };
    });

    const result = optimizeLineup(players, format);
    track("lineup_generated", { playerId: session.player_id, detail: `match:${body.matchId}` });
    return NextResponse.json({ lineup: result });
  }

  if (body.action === "save" || body.action === "confirm") {
    if (!body.slots || body.slots.length === 0) {
      return NextResponse.json({ error: "No lineup slots provided" }, { status: 400 });
    }

    // Upsert lineup
    let lineupId = (await db.prepare("SELECT id FROM lineups WHERE match_id = ?").bind(body.matchId).first<{ id: string }>())?.id;

    let prevLineupStatus: string | null = null;
    if (lineupId) {
      prevLineupStatus = (await db.prepare("SELECT status FROM lineups WHERE id = ?").bind(lineupId).first<{ status: string }>())?.status ?? null;
    }

    const prevAcks = new Map<string, { acknowledged: number | null; acknowledged_at: string | null }>();
    const prevPlayerIds = new Set<string>();
    if (lineupId) {
      const existing = (
        await db
          .prepare("SELECT player_id, is_alternate, acknowledged, acknowledged_at FROM lineup_slots WHERE lineup_id = ?")
          .bind(lineupId)
          .all<{ player_id: string; is_alternate: number; acknowledged: number | null; acknowledged_at: string | null }>()
      ).results;
      for (const row of existing) {
        if (row.is_alternate === 0) prevPlayerIds.add(row.player_id);
        if (row.acknowledged != null) {
          prevAcks.set(row.player_id, { acknowledged: row.acknowledged, acknowledged_at: row.acknowledged_at });
        }
      }

      await db.prepare("DELETE FROM lineup_slots WHERE lineup_id = ?").bind(lineupId).run();
      await db.prepare("UPDATE lineups SET status = ?, confirmed_at = ? WHERE id = ?")
        .bind(body.action === "confirm" ? "confirmed" : "draft", body.action === "confirm" ? new Date().toISOString() : null, lineupId).run();
    } else {
      lineupId = crypto.randomUUID();
      await db.prepare("INSERT INTO lineups (id, match_id, status, generated_at, confirmed_at) VALUES (?,?,?,?,?)")
        .bind(lineupId, body.matchId, body.action === "confirm" ? "confirmed" : "draft", new Date().toISOString(), body.action === "confirm" ? new Date().toISOString() : null).run();
    }

    await db.batch(
      body.slots.map((s, i) => {
        const prev = prevAcks.get(s.playerId);
        return db.prepare("INSERT INTO lineup_slots (id, lineup_id, position, player_id, is_alternate, acknowledged, acknowledged_at) VALUES (?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), lineupId, s.position, s.playerId, i >= (format.singles + format.doubles * 2) ? 1 : 0, prev?.acknowledged ?? null, prev?.acknowledged_at ?? null);
      })
    );

    if (body.action === "confirm") {
      await transitionMatch(body.matchId, "lineup_confirmed", { id: session.player_id, name: session.name });

      const matchInfo = await db.prepare(
        "SELECT opponent_team, match_date, match_time, location, notes, is_home FROM league_matches WHERE id = ?"
      ).bind(body.matchId).first<{ opponent_team: string; match_date: string; match_time: string | null; location: string | null; notes: string | null; is_home: number }>();

      if (matchInfo) {
        const dateStr = new Date(matchInfo.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        const starterCount = format.singles + format.doubles * 2;
        const newPlayerIds = new Set(body.slots.slice(0, starterCount).map((s) => s.playerId));
        /** True only if lineup was already confirmed — not merely a draft save (fixes notify on first confirm from draft) */
        const wasAlreadyConfirmed = prevLineupStatus === "confirmed";
        const addedIds = [...newPlayerIds].filter((id) => !prevPlayerIds.has(id));
        const removedIds = [...prevPlayerIds].filter((id) => !newPlayerIds.has(id));

        const allRelevantIds = wasAlreadyConfirmed
          ? [...new Set([...addedIds, ...removedIds])]
          : [...new Set(body.slots.map((s) => s.playerId))];

        if (allRelevantIds.length > 0) {
          const players = (
            await db.prepare(
              `SELECT id, name, email FROM players WHERE id IN (${allRelevantIds.map(() => "?").join(",")})`
            ).bind(...allRelevantIds).all<{ id: string; name: string; email: string }>()
          ).results;

          const allSlotPlayers = (
            await db.prepare(
              `SELECT id, name FROM players WHERE id IN (${[...new Set(body.slots.map((s) => s.playerId))].map(() => "?").join(",")})`
            ).bind(...[...new Set(body.slots.map((s) => s.playerId))]).all<{ id: string; name: string }>()
          ).results;

          const lineupHtml = body.slots.map((s) => {
            const p = allSlotPlayers.find((pl) => pl.id === s.playerId);
            return `<li><strong>${s.position}</strong>: ${p?.name ?? "TBD"}</li>`;
          }).join("");

          let timeStr = "";
          if (matchInfo.match_time) {
            const [h, m] = matchInfo.match_time.split(":").map(Number);
            timeStr = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
          }

          const logisticsHtml = `
            <table role="presentation" style="width: 100%; margin: 16px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0;">
              <tr>
                <td style="padding: 12px 16px; border-right: 1px solid #e2e8f0; width: 50%;">
                  <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">When</p>
                  <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${dateStr}${timeStr ? ` · ${timeStr}` : ""}</p>
                </td>
                <td style="padding: 12px 16px; width: 50%;">
                  <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Where</p>
                  <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${matchInfo.location || "TBD"}</p>
                </td>
              </tr>
              ${matchInfo.notes ? `<tr><td colspan="2" style="padding: 8px 16px; border-top: 1px solid #e2e8f0;"><p style="margin: 0; font-size: 13px; color: #475569;">${matchInfo.notes}</p></td></tr>` : ""}
            </table>`;

          const matchUrl = `https://framers.app/team/${slug}/match/${body.matchId}`;
          const addedSet = new Set(addedIds);
          const removedSet = new Set(removedIds);

          const teamName = (await db.prepare("SELECT name FROM teams WHERE id = ?").bind(team.id).first<{ name: string }>())?.name ?? "";
          const threadHdrs = matchThreadHeaders(body.matchId, { isFirst: !wasAlreadyConfirmed });
          const senderInfo = listSender(slug, teamName);

          const batch = players.map((p) => {
            if (removedSet.has(p.id)) {
              return {
                to: p.email,
                subject: `Lineup update: ${teamName} vs ${matchInfo!.opponent_team}`,
                ...senderInfo,
                html: emailTemplate(
                  `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">Lineup change, ${p.name.split(" ")[0]}</h2>
                   <p>You've been <strong>removed from the lineup</strong> for <strong>${matchInfo!.opponent_team}</strong> (${matchInfo!.is_home ? "Home" : "Away"}) on ${dateStr}.</p>
                   ${logisticsHtml}
                   <p style="color: #64748b;">If you think this is a mistake, reach out to the captain.</p>`,
                  { heading: "Lineup Updated", ctaUrl: matchUrl, ctaLabel: "View Match" }
                ),
                headers: threadHdrs,
              };
            }
            const myPositions = body.slots!.filter((s) => s.playerId === p.id).map((s) => s.position).join(", ");
            return {
              to: p.email,
              subject: `${wasAlreadyConfirmed && addedSet.has(p.id) ? "You've been added: " : "Lineup confirmed: "}${teamName} vs ${matchInfo!.opponent_team}`,
              ...senderInfo,
              html: emailTemplate(
                `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">You're playing, ${p.name.split(" ")[0]}!</h2>
                 <p>The lineup for <strong>${matchInfo!.opponent_team}</strong> (${matchInfo!.is_home ? "Home" : "Away"}) has been ${wasAlreadyConfirmed ? "updated" : "confirmed"}.</p>
                 ${logisticsHtml}
                 <p style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-weight: 600; color: #166534;">
                   Your position: ${myPositions}
                 </p>
                 <h3 style="font-size: 14px; color: #64748b; margin: 20px 0 8px 0;">Full Lineup</h3>
                 <ul style="padding-left: 20px; color: #334155;">${lineupHtml}</ul>
                 <p style="margin-top: 20px; font-size: 14px; font-weight: 600; color: #0c4a6e;">Please confirm you can make it:</p>`,
                { heading: wasAlreadyConfirmed ? "Lineup Updated" : "Lineup Confirmed", ctaUrl: matchUrl, ctaLabel: "Confirm I'll Be There", secondaryCtaUrl: matchUrl, secondaryCtaLabel: "Shit Happened, Can't Make It" }
              ),
              headers: threadHdrs,
            };
          });
          await sendEmailBatch(batch);
        }
      }
    }

    const trackEvent = body.action === "confirm" ? "lineup_confirmed" : "lineup_saved";
    track(trackEvent, { playerId: session.player_id, detail: `match:${body.matchId}` });

    if (body.action === "confirm") {
      (async () => {
        try {
          const { generateMatchPreview } = await import("@/lib/league-match-preview");
          await generateMatchPreview(body.matchId!);
        } catch (e) {
          console.error("[Match preview generation]", e);
        }
      })();
    }

    return NextResponse.json({ ok: true, lineupId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
