import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession, canAccessAdmin } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { optimizeLineup, type AvailablePlayer } from "@/lib/lineup-optimizer";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_team_roster",
      description: "Get the full team roster with ELO ratings, NTRP, and preferences",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_match_schedule",
      description: "Get upcoming and recent matches for the team",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_availability",
      description: "Get player availability/RSVP for a specific match, or for all upcoming matches if no matchId given",
      parameters: {
        type: "object",
        properties: {
          matchId: { type: "string", description: "Specific match ID (optional — omit for all upcoming)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_player_match_counts",
      description: "Get how many matches each player has played this season, including default wins vs actual play",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_lineup",
      description: "Run the lineup optimizer for a specific match. Returns the suggested lineup based on availability, ELO, fairness, and preferences.",
      parameters: {
        type: "object",
        properties: {
          matchId: { type: "string", description: "The match to generate a lineup for" },
          excludePlayerIds: {
            type: "array",
            items: { type: "string" },
            description: "Player IDs to exclude from the lineup (e.g. injured/unavailable)",
          },
          forcePlayerIds: {
            type: "array",
            items: { type: "string" },
            description: "Player IDs that must be included in the lineup",
          },
        },
        required: ["matchId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_lineup",
      description: "Save a draft lineup to the database for a match. Only call this when the captain explicitly asks to draft/save. Positions should be S1, S2, D1A, D1B, D2A, D2B, D3A, D3B.",
      parameters: {
        type: "object",
        properties: {
          matchId: { type: "string" },
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                position: { type: "string" },
                playerId: { type: "string" },
              },
              required: ["position", "playerId"],
            },
          },
        },
        required: ["matchId", "slots"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_head_to_head",
      description: "Get historical results for a player or pair across all league matches",
      parameters: {
        type: "object",
        properties: {
          playerId: { type: "string", description: "Player ID to look up" },
        },
        required: ["playerId"],
      },
    },
  },
];

// Tool handlers — each returns a JSON string to feed back to the model
async function handleTool(
  db: D1Database,
  teamId: string,
  teamSlug: string,
  fnName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (fnName) {
    case "get_team_roster": {
      const roster = (
        await db.prepare(
          `SELECT p.id, p.name, p.singles_elo, p.doubles_elo, p.ntrp_rating, p.ntrp_type,
                  tm.role, tm.preferences
           FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           WHERE tm.team_id = ? AND tm.active = 1
           ORDER BY MAX(p.singles_elo, p.doubles_elo) DESC`
        ).bind(teamId).all<{
          id: string; name: string; singles_elo: number; doubles_elo: number;
          ntrp_rating: number; ntrp_type: string; role: string; preferences: string | null;
        }>()
      ).results;

      return JSON.stringify(roster.map((r) => ({
        id: r.id,
        name: r.name,
        singlesElo: r.singles_elo,
        doublesElo: r.doubles_elo,
        ntrp: `${r.ntrp_rating}${r.ntrp_type}`,
        role: r.role,
        preferences: r.preferences ? JSON.parse(r.preferences) : {},
      })));
    }

    case "get_match_schedule": {
      const matches = (
        await db.prepare(
          `SELECT id, round_number, opponent_team, match_date, match_time, location,
                  is_home, team_result, team_score, status
           FROM league_matches
           WHERE team_id = ?
           ORDER BY match_date ASC`
        ).bind(teamId).all<{
          id: string; round_number: number; opponent_team: string; match_date: string;
          match_time: string | null; location: string | null; is_home: number;
          team_result: string | null; team_score: string | null; status: string;
        }>()
      ).results;

      return JSON.stringify(matches.map((m) => ({
        id: m.id,
        round: m.round_number,
        opponent: m.opponent_team,
        date: m.match_date,
        time: m.match_time,
        location: m.location,
        home: m.is_home === 1,
        result: m.team_result,
        score: m.team_score,
        status: m.status,
      })));
    }

    case "get_availability": {
      const matchId = args.matchId as string | undefined;
      let query: string;
      let binds: unknown[];

      if (matchId) {
        query = `SELECT a.player_id, p.name, a.status, a.responded_at,
                        p.singles_elo, p.doubles_elo
                 FROM availability a
                 JOIN players p ON p.id = a.player_id
                 WHERE a.match_id = ?
                 ORDER BY CASE a.status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'no' THEN 2 END`;
        binds = [matchId];
      } else {
        query = `SELECT a.player_id, p.name, a.status, a.match_id, lm.round_number, lm.match_date
                 FROM availability a
                 JOIN players p ON p.id = a.player_id
                 JOIN league_matches lm ON lm.id = a.match_id
                 WHERE lm.team_id = ? AND lm.status != 'completed'
                 ORDER BY lm.match_date ASC, CASE a.status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 WHEN 'no' THEN 2 END`;
        binds = [teamId];
      }

      const stmt = db.prepare(query);
      const results = (await stmt.bind(...binds).all()).results;
      return JSON.stringify(results);
    }

    case "get_player_match_counts": {
      const counts = (
        await db.prepare(
          `SELECT p.id, p.name,
                  COUNT(DISTINCT lmr.match_id) as total_matches,
                  SUM(CASE WHEN lmr.is_default_win = 1 THEN 1 ELSE 0 END) as default_wins,
                  SUM(CASE WHEN lmr.won = 1 THEN 1 ELSE 0 END) as wins,
                  SUM(CASE WHEN lmr.won = 0 THEN 1 ELSE 0 END) as losses
           FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN league_match_results lmr ON (lmr.player1_id = p.id OR lmr.player2_id = p.id)
             AND lmr.match_id IN (SELECT id FROM league_matches WHERE team_id = ?)
           WHERE tm.team_id = ? AND tm.active = 1
           GROUP BY p.id
           ORDER BY total_matches DESC`
        ).bind(teamId, teamId).all<{
          id: string; name: string; total_matches: number;
          default_wins: number; wins: number; losses: number;
        }>()
      ).results;

      return JSON.stringify(counts.map((c) => ({
        id: c.id,
        name: c.name,
        totalMatches: c.total_matches,
        actualPlayed: c.total_matches - c.default_wins,
        defaultWins: c.default_wins,
        wins: c.wins,
        losses: c.losses,
      })));
    }

    case "suggest_lineup": {
      const matchId = args.matchId as string;
      const excludeIds = new Set((args.excludePlayerIds as string[] | undefined) || []);
      const forceIds = new Set((args.forcePlayerIds as string[] | undefined) || []);

      const team = await db.prepare("SELECT match_format, min_matches_goal FROM teams WHERE id = ?")
        .bind(teamId).first<{ match_format: string; min_matches_goal: number }>();
      const format = JSON.parse(team?.match_format || '{"singles":1,"doubles":3}');
      const minGoal = team?.min_matches_goal || 3;

      const members = (
        await db.prepare(
          `SELECT p.id, p.name, p.singles_elo, p.doubles_elo, tm.preferences,
                  a.status as rsvp_status, a.is_before_deadline
           FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN availability a ON a.player_id = p.id AND a.match_id = ?
           WHERE tm.team_id = ? AND tm.active = 1`
        ).bind(matchId, teamId).all<{
          id: string; name: string; singles_elo: number; doubles_elo: number;
          preferences: string | null; rsvp_status: string | null; is_before_deadline: number;
        }>()
      ).results;

      const matchCounts = (
        await db.prepare(
          `SELECT p.id,
                  COUNT(DISTINCT lmr.match_id) as total,
                  SUM(CASE WHEN lmr.is_default_win = 1 THEN 1 ELSE 0 END) as defaults
           FROM team_memberships tm
           JOIN players p ON p.id = tm.player_id
           LEFT JOIN league_match_results lmr ON (lmr.player1_id = p.id OR lmr.player2_id = p.id)
             AND lmr.match_id IN (SELECT id FROM league_matches WHERE team_id = ?)
           WHERE tm.team_id = ? AND tm.active = 1
           GROUP BY p.id`
        ).bind(teamId, teamId).all<{ id: string; total: number; defaults: number }>()
      ).results;
      const countMap = Object.fromEntries(matchCounts.map((c) => [c.id, c]));

      const availablePlayers: AvailablePlayer[] = members
        .filter((m) => {
          if (excludeIds.has(m.id)) return false;
          if (forceIds.has(m.id)) return true;
          return m.rsvp_status !== "no";
        })
        .map((m) => {
          const prefs = m.preferences ? JSON.parse(m.preferences) : {};
          const counts = countMap[m.id] || { total: 0, defaults: 0 };
          let rsvp: AvailablePlayer["rsvpStatus"] = "maybe";
          if (m.rsvp_status === "yes") rsvp = "yes";
          else if (m.rsvp_status === "no") rsvp = "call_last";
          else if (prefs.doublesOnly) rsvp = "doubles_only";

          return {
            id: m.id,
            name: m.name,
            singlesElo: m.singles_elo,
            doublesElo: m.doubles_elo,
            matchesPlayedThisSeason: counts.total,
            defaultWinsThisSeason: counts.defaults,
            minMatchesGoal: minGoal,
            preferences: prefs,
            rsvpStatus: rsvp,
            rsvpBeforeDeadline: m.is_before_deadline === 1,
            reliabilityScore: 1,
          };
        });

      const result = optimizeLineup(availablePlayers, format);

      return JSON.stringify({
        lineup: result.slots.map((s) => ({
          position: s.position,
          playerId: s.playerId,
          playerName: s.playerName,
          elo: s.score,
        })),
        alternates: result.alternates.map((a) => ({ id: a.id, name: a.name })),
        unassigned: result.unassigned.map((u) => ({ id: u.id, name: u.name })),
      });
    }

    case "draft_lineup": {
      const matchId = args.matchId as string;
      const slots = args.slots as { position: string; playerId: string }[];

      if (!matchId || !slots || slots.length === 0) {
        return JSON.stringify({ error: "matchId and slots are required" });
      }

      const matchExists = await db.prepare("SELECT id FROM league_matches WHERE id = ? AND team_id = ?")
        .bind(matchId, teamId).first<{ id: string }>();
      if (!matchExists) {
        return JSON.stringify({ error: `Match '${matchId}' not found for this team. Use get_match_schedule to find valid match IDs.` });
      }

      const existing = await db.prepare("SELECT id FROM lineups WHERE match_id = ?")
        .bind(matchId).first<{ id: string }>();

      let lineupId: string;
      if (existing) {
        lineupId = existing.id;
        await db.prepare("DELETE FROM lineup_slots WHERE lineup_id = ?").bind(lineupId).run();
        await db.prepare("UPDATE lineups SET status = 'draft', generated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
          .bind(lineupId).run();
      } else {
        lineupId = crypto.randomUUID();
        await db.prepare(
          "INSERT INTO lineups (id, match_id, status, generated_at) VALUES (?, ?, 'draft', strftime('%Y-%m-%dT%H:%M:%SZ','now'))"
        ).bind(lineupId, matchId).run();
      }

      const stmts = slots.map((s) =>
        db.prepare(
          "INSERT INTO lineup_slots (id, lineup_id, position, player_id) VALUES (?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), lineupId, s.position, s.playerId)
      );
      if (stmts.length > 0) await db.batch(stmts);

      return JSON.stringify({ ok: true, lineupId, slotsCreated: slots.length });
    }

    case "get_head_to_head": {
      const playerId = args.playerId as string;

      const results = (
        await db.prepare(
          `SELECT lmr.position, lmr.won, lmr.our_score, lmr.opp_score, lmr.is_default_win,
                  lm.opponent_team, lm.match_date, lm.round_number
           FROM league_match_results lmr
           JOIN league_matches lm ON lm.id = lmr.match_id
           WHERE (lmr.player1_id = ? OR lmr.player2_id = ?) AND lm.team_id = ?
           ORDER BY lm.match_date DESC`
        ).bind(playerId, playerId, teamId).all<{
          position: string; won: number; our_score: string | null; opp_score: string | null;
          is_default_win: number; opponent_team: string; match_date: string; round_number: number;
        }>()
      ).results;

      return JSON.stringify(results.map((r) => ({
        round: r.round_number,
        date: r.match_date,
        opponent: r.opponent_team,
        position: r.position,
        won: r.won === 1,
        score: r.our_score && r.opp_score ? `${r.our_score} vs ${r.opp_score}` : null,
        defaultWin: r.is_default_win === 1,
      })));
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${fnName}` });
  }
}

function buildSystemPrompt(teamName: string, teamSlug: string): string {
  return `You are the AI Lineup Assistant for ${teamName}, a USTA tennis league team. You help the captain plan lineups for matches.

You have access to tools to query the database. Use them to answer questions about availability, player stats, match history, and to suggest or draft lineups.

Key concepts:
- Each match has 5 lines: S1, S2 (singles), D1, D2, D3 (doubles). Each doubles line has two players (D1A/D1B, etc.)
- D1 is worth 2 points in 40+ leagues; all others worth 1 point. Winning 4+ points wins the match.
- Players have singles ELO and doubles ELO ratings. Higher = stronger.
- NTRP ratings: 2.5, 3.0, 3.5 etc. "C" = computer-rated, "S" = self-rated.
- Goal: everyone plays at least ~4 matches in the season for fairness.
- "Default wins" count officially but the player didn't actually play — prioritize giving those players real court time.
- Availability: "yes" = confirmed, "maybe" = tentative, "no" = can't make it.
- Some players prefer doubles only (doublesOnly preference).

When suggesting lineups:
- Put strongest players on highest lines (S1 > S2, D1 > D2 > D3)
- Honor doubles-only preferences unless it would cause a forfeit
- Balance playing time across the team
- Consider who has played recently and who needs more matches
- Use the suggest_lineup tool for optimized suggestions, then explain the reasoning

When drafting lineups:
- Only draft when the captain explicitly says to save/draft
- Always confirm before drafting

Be concise and conversational. Use player first names when unambiguous. Format lineups as clean tables.`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = await getDB();

  const team = await db.prepare("SELECT id, name FROM teams WHERE slug = ?")
    .bind(slug).first<{ id: string; name: string }>();
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isAdmin = session.is_admin === 1;
  let canManage = isAdmin;
  if (!isAdmin) {
    const membership = await db.prepare(
      "SELECT role FROM team_memberships WHERE player_id = ? AND team_id = ?"
    ).bind(session.player_id, team.id).first<{ role: string }>();
    canManage = membership?.role === "captain" || membership?.role === "co-captain";
  }

  if (!canManage) {
    return NextResponse.json({ error: "Captain access required" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {

  const body = (await request.json()) as { messages: { role: string; content: string }[] };
  const userMessages = body.messages || [];

  if (userMessages.length === 0) {
    return NextResponse.json({ error: "No messages provided" }, { status: 400 });
  }

  const systemMessage: ChatMessage = {
    role: "system",
    content: buildSystemPrompt(team.name, slug),
  };

  const messages: ChatMessage[] = [
    systemMessage,
    ...userMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // OpenAI conversation loop — keep calling until we get a final response (no more tool calls)
  const MAX_TURNS = 8;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json({ error: "AI is rate-limited right now — try again in a minute." }, { status: 429 });
      }
      const errText = await response.text();
      return NextResponse.json({ error: `AI service error (${response.status}). Try again shortly.`, detail: errText }, { status: 502 });
    }

    const data = (await response.json()) as {
      choices: [{
        message: {
          role: string;
          content: string | null;
          tool_calls?: ToolCall[];
        };
        finish_reason: string;
      }];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const assistantMsg = data.choices[0].message;
    messages.push(assistantMsg as ChatMessage);

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return NextResponse.json({
        reply: assistantMsg.content || "",
        usage: data.usage,
      });
    }

    // Execute tool calls and append results
    for (const tc of assistantMsg.tool_calls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        // empty args is fine
      }

      let result: string;
      try {
        result = await handleTool(db, team.id, slug, tc.function.name, parsedArgs);
      } catch (e) {
        result = JSON.stringify({ error: `Tool '${tc.function.name}' failed: ${e instanceof Error ? e.message : String(e)}` });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  return NextResponse.json({
    reply: "I hit my limit on tool calls for this question. Could you try rephrasing or breaking it into smaller questions?",
  });
} catch (e) {
  console.error("AI lineup error:", e);
  return NextResponse.json(
    { error: `Something went wrong: ${e instanceof Error ? e.message : String(e)}` },
    { status: 500 }
  );
}
}
