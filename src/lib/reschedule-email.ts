/**
 * Helpers for the "match rescheduled — please re-RSVP & re-confirm" flow.
 *
 * Two entry points use these:
 *   1. The match PATCH handler, which fires an immediate blast when a captain
 *      saves a schedule change that meaningfully shifts the play dates.
 *   2. The daily cron, which re-nags lineup starters that still haven't
 *      re-acknowledged their slot after a recent reschedule.
 */

import {
  type ScheduleBlock,
  describeLines,
  formatSlotDate,
  formatSlotTime,
} from "@/lib/line-schedule";
import { buildCaptainNoteHtml } from "@/lib/email-logistics";
import { emailTemplate, matchThreadHeaders, listSender } from "@/lib/email";

const POSITION_LABEL: Record<string, string> = {
  D1A: "Doubles 1",
  D1B: "Doubles 1",
  D2A: "Doubles 2",
  D2B: "Doubles 2",
  D3A: "Doubles 3",
  D3B: "Doubles 3",
  S1: "Singles 1",
  S2: "Singles 2",
};

export function formatScheduleSummary(blocks: ScheduleBlock[]): string {
  if (blocks.length === 0) return "";
  if (blocks.length === 1) {
    const b = blocks[0];
    const time = b.time ? ` · ${formatSlotTime(b.time)}` : "";
    return `${formatSlotDate(b.date)}${time}`;
  }
  return blocks
    .map((b) => {
      const time = b.time ? ` · ${formatSlotTime(b.time)}` : "";
      return `${formatSlotDate(b.date)}${time} — ${describeLines(b.lines)}`;
    })
    .join("; ");
}

function blocksHtml(blocks: ScheduleBlock[]): string {
  const rows = blocks
    .map((b) => {
      const dateStr = formatSlotDate(b.date);
      const timeStr = b.time ? formatSlotTime(b.time) : "TBD";
      const lines = describeLines(b.lines);
      return `<tr>
        <td style="padding: 6px 10px; font-weight: 600; color: #0c4a6e; white-space: nowrap;">${dateStr}</td>
        <td style="padding: 6px 10px; color: #1e293b; white-space: nowrap;">${timeStr}</td>
        <td style="padding: 6px 10px; color: #475569;">${lines}</td>
      </tr>`;
    })
    .join("");
  return `
    <table role="presentation" style="width: 100%; margin: 12px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0; font-size: 13px;">
      <thead>
        <tr>
          <th style="padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0;">Date</th>
          <th style="padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0;">Time</th>
          <th style="padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0;">Lines</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export interface RescheduleEmailContext {
  teamName: string;
  teamSlug: string;
  opponent: string;
  matchId: string;
  captainNotes: string | null;
  /** Human-friendly summary of play dates *before* this edit. */
  previousSummary: string;
  /** New schedule blocks (split-aware). */
  newBlocks: ScheduleBlock[];
  /** True when the player is a starter in the current lineup. Surfaces an extra "please re-confirm your line" CTA. */
  isStarter: boolean;
  /** Their position(s) in the lineup, if any. */
  starterPositions?: string[];
  /** True if RSVPs were wiped as part of this edit. */
  rsvpsReset: boolean;
  /** Signoff name (e.g. "Hannes & Matt"). */
  signoff: string;
  /** Player's first name. */
  firstName: string;
}

export function buildRescheduleEmailHtml(ctx: RescheduleEmailContext): string {
  const matchUrl = `https://framers.app/team/${ctx.teamSlug}/match/${ctx.matchId}`;
  const scheduleBlock = blocksHtml(ctx.newBlocks);
  const split = new Set(ctx.newBlocks.map((b) => b.date)).size > 1;

  const starterLabel = ctx.isStarter
    ? (() => {
        const labels = (ctx.starterPositions ?? [])
          .map((p) => POSITION_LABEL[p] ?? p)
          .filter((v, i, a) => a.indexOf(v) === i);
        const lineStr = labels.length > 0 ? labels.join(" & ") : "the lineup";
        return `<div style="margin: 12px 0; padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
          <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #991b1b; letter-spacing: 0.5px;">You're on the card</p>
          <p style="margin: 0; font-size: 14px; color: #7f1d1d;">You're penciled in at <strong>${lineStr}</strong>. Please re-confirm you can still make the new schedule — if you can't, flag it now so we can hunt for a replacement.</p>
        </div>`;
      })()
    : "";

  const rsvpLine = ctx.rsvpsReset
    ? `<p style="margin: 8px 0;">Because the date${split ? "(s)" : ""} changed, <strong>everyone's RSVP was reset</strong>. Please re-RSVP against the new schedule so we know who's still in.</p>`
    : `<p style="margin: 8px 0;">Please confirm your RSVP still works against the new schedule.</p>`;

  return emailTemplate(
    `<h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0c4a6e;">Hey ${ctx.firstName},</h2>
     <p>Heads up — our match against <strong>${ctx.opponent}</strong> has been <strong>rescheduled</strong>.</p>
     ${ctx.previousSummary ? `<p style="margin: 8px 0; font-size: 13px; color: #64748b;">Was: ${ctx.previousSummary}</p>` : ""}
     <p style="margin: 4px 0; font-size: 13px; font-weight: 700; color: #0c4a6e; text-transform: uppercase; letter-spacing: 0.5px;">New schedule${split ? " (split)" : ""}</p>
     ${scheduleBlock}
     ${starterLabel}
     ${rsvpLine}
     ${buildCaptainNoteHtml(ctx.captainNotes)}
     <p style="margin-top: 16px; font-size: 14px; color: #475569;">&mdash; ${ctx.signoff}</p>`,
    {
      heading: "Match rescheduled",
      ctaUrl: matchUrl,
      ctaLabel: ctx.isStarter ? "Re-confirm & RSVP" : "Re-RSVP now",
    },
  );
}

export interface RescheduleBatchRecipient {
  playerId: string;
  email: string;
  name: string;
  isStarter: boolean;
  starterPositions?: string[];
}

export function buildRescheduleEmailBatch(args: {
  teamName: string;
  teamSlug: string;
  opponent: string;
  matchId: string;
  captainNotes: string | null;
  previousSummary: string;
  newBlocks: ScheduleBlock[];
  rsvpsReset: boolean;
  signoff: string;
  recipients: RescheduleBatchRecipient[];
}) {
  const sender = listSender(args.teamSlug, args.teamName);
  const summary = formatScheduleSummary(args.newBlocks);
  const subject = `Rescheduled: ${args.opponent} — now ${summary}`;

  return args.recipients.map((r) => ({
    to: r.email,
    subject,
    ...sender,
    html: buildRescheduleEmailHtml({
      teamName: args.teamName,
      teamSlug: args.teamSlug,
      opponent: args.opponent,
      matchId: args.matchId,
      captainNotes: args.captainNotes,
      previousSummary: args.previousSummary,
      newBlocks: args.newBlocks,
      isStarter: r.isStarter,
      starterPositions: r.starterPositions,
      rsvpsReset: args.rsvpsReset,
      signoff: args.signoff,
      firstName: r.name.split(" ")[0],
    }),
    headers: matchThreadHeaders(args.matchId),
  }));
}
