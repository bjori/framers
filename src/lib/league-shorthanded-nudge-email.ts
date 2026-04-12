/**
 * GPT-4o-mini one shared paragraph per batch for league RSVP / shorthanded emails.
 * Falls back to static copy when API key missing or call fails.
 */

async function callGpt(apiKey: string, systemPrompt: string, userContent: string): Promise<string> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.88,
        max_tokens: 220,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[shorthanded-nudge] GPT:", await res.text());
      return "";
    }
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const t = json.choices[0]?.message?.content?.trim() ?? "";
    return t.replace(/^["']|["']$/g, "");
  } catch (e) {
    console.error("[shorthanded-nudge] GPT error:", e);
    return "";
  }
}

const RSVP_SYSTEM = `You write short email body copy for a neighborhood USTA tennis team captain (Greenbrook Framers).
Tone: warm, direct, a little urgent but never manipulative or guilt-tripping. No emojis. No ALL CAPS.
Output 2–4 sentences of plain text only (no HTML, no subject line).`;

const LINEUP_SYSTEM = `You write short email body copy for a neighborhood USTA tennis team captain when the posted lineup still has empty starter spots (risk of defaulting a line).
Tone: earnest, human, slightly embarrassing-for-the-team but respectful. Encourage people who said No or Maybe to reconsider if their plans could flex. No emojis, no guilt manipulation.
Output 2–4 sentences of plain text only (no HTML, no subject line).`;

export async function generateRsvpNeedMoreYesPitch(
  apiKey: string | undefined,
  ctx: {
    teamName: string;
    opponentTeam: string;
    matchDateLabel: string;
    yesCount: number;
    needed: number;
    daysUntilMatch: number;
  },
): Promise<string> {
  const fallback = `We only have ${ctx.yesCount} "Yes" RSVPs and need ${ctx.needed} to fill the card for ${ctx.opponentTeam} on ${ctx.matchDateLabel}. If there is any chance you can play, please switch to Yes on Framers — even a Maybe helps us plan, but Yes is what saves us from going in short.`;

  if (!apiKey) return fallback;

  const user = JSON.stringify({
    team: ctx.teamName,
    opponent: ctx.opponentTeam,
    date: ctx.matchDateLabel,
    yesRsvps: ctx.yesCount,
    needYesRsvps: ctx.needed,
    daysUntilMatch: ctx.daysUntilMatch,
  });

  const out = await callGpt(
    apiKey,
    RSVP_SYSTEM,
    `Write the body paragraph for this situation (JSON): ${user}`,
  );
  return out || fallback;
}

export async function generateShorthandedLineupPitch(
  apiKey: string | undefined,
  ctx: {
    teamName: string;
    opponentTeam: string;
    matchDateLabel: string;
    vacantLinesLabel: string;
    phase: "five" | "three" | "one";
  },
): Promise<string> {
  const phaseHint =
    ctx.phase === "five"
      ? "Match is five days away."
      : ctx.phase === "three"
        ? "Match is three days away."
        : "Match is tomorrow — last real chance to change plans.";

  const fallback = `We still have open spot(s) on ${ctx.vacantLinesLabel} for ${ctx.opponentTeam} (${ctx.matchDateLabel}). ${phaseHint} If you tapped No or Maybe earlier but your schedule opened up even a little, flipping to Yes would help us avoid defaulting a line — the team would really appreciate it.`;

  if (!apiKey) return fallback;

  const user = JSON.stringify({
    team: ctx.teamName,
    opponent: ctx.opponentTeam,
    date: ctx.matchDateLabel,
    openLines: ctx.vacantLinesLabel,
    phase: ctx.phase,
    phaseHint,
  });

  const out = await callGpt(
    apiKey,
    LINEUP_SYSTEM,
    `Write the body paragraph for this situation (JSON): ${user}`,
  );
  return out || fallback;
}
