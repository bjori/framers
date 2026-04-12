import Link from "next/link";

export interface NextMatchData {
  matchId: string;
  opponentTeam: string;
  matchDate: string;
  matchTime: string | null;
  location: string | null;
  isHome: boolean;
  status: string;
  lineupStatus: string;
  lineupSlots: {
    position: string;
    playerName: string | null;
    playerId: string;
    acknowledged: boolean;
  }[];
  rsvp: { yes: number; maybe: number; no: number };
  preview: {
    quip: string;
    lineInsights: { position: string; players: string; insight: string }[];
    generatedAt: string;
  } | null;
  slug: string;
  /** Human-readable vacant lines (e.g. "Doubles 3"); null when full card */
  vacantLinesLabel: string | null;
}

const POSITION_LABELS: Record<string, string> = {
  D1: "Doubles 1",
  D2: "Doubles 2",
  D3: "Doubles 3",
  S1: "Singles 1",
  S2: "Singles 2",
};

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function statusColor(status: string) {
  switch (status) {
    case "Lineup locked": return "bg-accent/10 text-accent";
    case "Lineup confirmed": return "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300";
    case "Lineup draft": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
    default: return "bg-slate-200 dark:bg-slate-700 text-slate-500";
  }
}

export function NextMatchCard({ data }: { data: NextMatchData }) {
  const dateStr = new Date(data.matchDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // Group doubles pairs by position root (D1, D2, D3)
  const positionGroups = new Map<string, typeof data.lineupSlots>();
  for (const s of data.lineupSlots) {
    const root = s.position.replace(/[ab]$/i, "");
    if (!positionGroups.has(root)) positionGroups.set(root, []);
    positionGroups.get(root)!.push(s);
  }

  const insightMap = new Map(
    data.preview?.lineInsights.map((li) => [li.position, li]) ?? []
  );

  return (
    <Link
      href={`/team/${data.slug}/match/${data.matchId}`}
      className="block bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-indigo-950/30 border border-sky-200 dark:border-sky-800 rounded-xl p-4 sm:p-5 hover:border-sky-400 dark:hover:border-sky-600 transition-colors"
    >
      {data.vacantLinesLabel && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-danger/40 bg-danger/10 dark:bg-danger/20 px-3 py-2.5 text-sm text-danger dark:text-red-200"
        >
          <p className="font-bold text-danger dark:text-red-100">Shorthanded — default risk</p>
          <p className="mt-1 leading-snug">
            <strong>{data.vacantLinesLabel}</strong> still has open spot(s). In USTA play that usually means those line(s) will{" "}
            <strong>default</strong>. If you can play, switch your RSVP to <strong>Yes</strong> on this match so captains can slot you in.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase text-sky-600 dark:text-sky-400 tracking-wider mb-1">Next Match</p>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              data.isHome ? "bg-accent/10 text-accent" : "bg-slate-200 dark:bg-slate-700 text-slate-500"
            }`}>
              {data.isHome ? "HOME" : "AWAY"}
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{data.opponentTeam}</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {dateStr}
            {data.matchTime ? ` · ${fmtTime(data.matchTime)}` : ""}
            {data.location ? ` · ${data.location}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColor(data.lineupStatus)}`}>
            {data.lineupStatus}
          </span>
          <p className="text-[10px] text-slate-400">
            {data.rsvp.yes} yes · {data.rsvp.maybe} maybe
          </p>
        </div>
      </div>

      {/* AI Quip */}
      {data.preview?.quip && (
        <p className="text-sm italic text-slate-700 dark:text-slate-300 mb-3 leading-relaxed">
          {data.preview.quip}
        </p>
      )}

      {/* Lineup with per-line insights */}
      {data.lineupSlots.length > 0 && (
        <div className="border-t border-sky-200/50 dark:border-sky-800/50 pt-3 space-y-1.5">
          {Array.from(positionGroups.entries()).map(([pos, players]) => {
            const insight = insightMap.get(pos);
            const names = players
              .map((p) => (p.playerName?.trim() ? p.playerName.split(" ")[0] : "Vacant"))
              .join(" & ");
            const hasVacant = players.some((p) => !p.playerName?.trim());
            const allAcked = players.every((p) => p.playerName?.trim() && p.acknowledged);
            const anyPending = players.some((p) => p.playerName?.trim() && !p.acknowledged);

            return (
              <div key={pos} className="flex items-start gap-3">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0 min-w-[5.25rem] sm:min-w-[6.25rem] leading-tight pt-0.5">
                  {POSITION_LABELS[pos] ?? pos}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span
                      className={`text-sm font-medium ${
                        hasVacant ? "text-danger dark:text-red-300" : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {names}
                    </span>
                    {allAcked && (
                      <span className="text-[9px] text-accent shrink-0" title="Confirmed">✓</span>
                    )}
                    {anyPending && !allAcked && (
                      <span
                        className="text-[9px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0"
                        title="Awaiting lineup confirmation on match page"
                      >
                        pending
                      </span>
                    )}
                  </div>
                  {insight && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">{insight.insight}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
