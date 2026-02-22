"use client";

interface LeagueMatch {
  id: string;
  round_number: number;
  opponent_team: string;
  match_date: string;
  match_time: string | null;
  location: string | null;
  is_home: number;
  team_result: string | null;
  team_score: string | null;
  status: string;
}

export function TeamSchedule({ matches, isReadOnly }: { matches: LeagueMatch[]; isReadOnly: boolean }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Schedule</h2>
      <div className="space-y-2">
        {matches.map((m) => {
          const isPast = m.status === "completed";
          const isOpen = m.status === "open";
          const won = m.team_result === "Won";

          return (
            <div
              key={m.id}
              className={`bg-surface-alt rounded-xl border border-border p-4 ${
                !isReadOnly && isOpen ? "hover:border-primary-light cursor-pointer" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      m.is_home
                        ? "bg-accent/10 text-accent"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                    }`}>
                      {m.is_home ? "HOME" : "AWAY"}
                    </span>
                    <span className="font-semibold text-sm truncate">{m.opponent_team}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(m.match_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {m.match_time ? ` at ${m.match_time}` : ""}
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {isPast && m.team_score && (
                    <div>
                      <span className={`text-lg font-bold ${won ? "text-accent" : "text-danger"}`}>
                        {m.team_score}
                      </span>
                      <p className={`text-[10px] font-bold uppercase ${won ? "text-accent" : "text-danger"}`}>
                        {m.team_result}
                      </p>
                    </div>
                  )}
                  {isOpen && !isReadOnly && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary">
                      RSVP
                    </span>
                  )}
                  {isOpen && isReadOnly && (
                    <span className="text-xs text-slate-400">--</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
