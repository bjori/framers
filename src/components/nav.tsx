"use client";

import Link from "next/link";
import { useState } from "react";

const teams = [
  { name: "Senior Framers 40+", slug: "senior-framers-2026", status: "active" as const },
  { name: "Junior Framers 18+", slug: "junior-framers-2026", status: "upcoming" as const },
];

const tournaments = [
  { name: "Singles Championship", slug: "singles-championship-2026", status: "active" as const },
];

const history = [
  { name: "The Framers 40+ (2025)", slug: "the-framers-2025" },
  { name: "Youth Framers 18+ (2025)", slug: "youth-framers-2025" },
];

function StatusDot({ status }: { status: "active" | "completed" | "upcoming" }) {
  const colors = {
    active: "bg-accent",
    completed: "bg-slate-400",
    upcoming: "bg-warning",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-primary text-white sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            Greenbrook Framers
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(!open)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/20 bg-primary-dark">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">USTA Teams</p>
              <div className="space-y-1">
                {teams.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/team/${t.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <StatusDot status={t.status} />
                    <span>{t.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">Tournaments</p>
              <div className="space-y-1">
                {tournaments.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/tournament/${t.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <StatusDot status={t.status} />
                    <span>{t.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">History</p>
              <div className="space-y-1">
                {history.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/team/${t.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <StatusDot status="completed" />
                    <span>{t.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-white/20 pt-3 space-y-1">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                My Dashboard
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                Settings
              </Link>
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                Admin
              </Link>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
