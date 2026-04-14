import { displayLeagueMatchLocation } from "@/lib/league-venues";

export function buildLogisticsHtml(opts: {
  dateStr: string;
  timeStr: string;
  location: string | null;
  isHome: number | boolean;
  notes: string | null;
  captainNotes: string | null;
}): string {
  const where = displayLeagueMatchLocation(opts.location, opts.isHome);
  return `
    <table role="presentation" style="width: 100%; margin: 16px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-spacing: 0;">
      <tr>
        <td style="padding: 12px 16px; border-right: 1px solid #e2e8f0; width: 50%;">
          <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">When</p>
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${opts.dateStr}${opts.timeStr ? ` · ${opts.timeStr}` : ""}</p>
        </td>
        <td style="padding: 12px 16px; width: 50%;">
          <p style="margin: 0 0 2px 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px;">Where</p>
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">${where}</p>
        </td>
      </tr>
      ${opts.notes ? `<tr><td colspan="2" style="padding: 8px 16px; border-top: 1px solid #e2e8f0;"><p style="margin: 0; font-size: 13px; color: #475569;">${opts.notes}</p></td></tr>` : ""}
    </table>${opts.captainNotes ? buildCaptainNoteHtml(opts.captainNotes) : ""}`;
}

export function buildCaptainNoteHtml(captainNotes: string | null | undefined): string {
  if (!captainNotes) return "";
  return `
    <div style="margin: 12px 0; padding: 12px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
      <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #92400e; letter-spacing: 0.5px;">Captain's Note</p>
      <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-line;">${captainNotes}</p>
    </div>`;
}
