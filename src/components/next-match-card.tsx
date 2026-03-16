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
    playerName: string;
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
}

const POSITION_LABELS: Record<string, string> = {
  D1: "Doubles 1", D1a: "D1", D1b: "D1",
  D2: "Doubles 2", D2a: "D2", D2b: "D2",
  D3: "Doubles 3", D3a: "D3", D3b: "D3",
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
            const isDoubles = pos.startsWith("D");
            const names = players.map((p) => p.playerName.split(" ")[0]).join(" & ");
            const allAcked = players.every((p) => p.acknowledged);
            const anyPending = players.some((p) => !p.acknowledged);

            return (
              <div key={pos} className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 w-6 pt-0.5 shrink-0">
                  {POSITION_LABELS[pos] ?? pos}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{names}</span>
                    {allAcked && (
                      <span className="text-[9px] text-accent" title="Confirmed">✓</span>
                    )}
                    {anyPending && !allAcked && (
                      <span className="text-[9px] text-amber-500" title="Awaiting confirmation">?</span>
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
