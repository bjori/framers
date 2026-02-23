"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardPracticeRsvp } from "./dashboard-rsvp";

export default function DashboardPracticeCard({
  id,
  sessionDate,
  startTime,
  initialYes,
  myRsvp,
}: {
  id: string;
  sessionDate: string;
  startTime: string;
  initialYes: number;
  myRsvp: string | null;
}) {
  const [yesCount, setYesCount] = useState(initialYes);
  const faded = myRsvp === "no";
  const needsRsvp = !myRsvp;

  return (
    <div
      className={`flex items-center overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800/50 transition-colors ${
        faded ? "opacity-40" : "hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      <Link href={`/practice/${id}`} className="flex items-center gap-2 flex-1 min-w-0 p-3">
        {myRsvp === "yes" ? (
          <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
        ) : myRsvp === "maybe" ? (
          <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />
        ) : myRsvp === "no" ? (
          <span className="w-2.5 h-2.5 rounded-full bg-danger shrink-0" />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
        )}
        <div>
          <p className="font-medium text-sm">Practice</p>
          <p className="text-xs text-slate-500">{yesCount} going</p>
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        {!needsRsvp && (
          <div className="text-right pr-3">
            <p className="text-xs font-semibold">
              {new Date(sessionDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <p className="text-[11px] text-slate-400">{startTime}</p>
          </div>
        )}
      </div>
      {needsRsvp && (
        <>
          <div className="text-right pr-2">
            <p className="text-xs font-semibold">
              {new Date(sessionDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <p className="text-[11px] text-slate-400">{startTime}</p>
          </div>
          <DashboardPracticeRsvp
            sessionId={id}
            initialYes={yesCount}
            onCountChange={setYesCount}
          />
        </>
      )}
    </div>
  );
}
