"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface NavData {
  teams: { name: string; slug: string; status: string }[];
  tournaments: { name: string; slug: string; status: string }[];
  history: { name: string; slug: string; kind: string }[];
}

interface User {
  player_id: string;
  name: string;
  email: string;
  is_admin: number;
  can_admin?: boolean;
  isImpersonating?: boolean;
  realAdminName?: string;
}

interface PlayerOption {
  id: string;
  name: string;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-accent",
    completed: "bg-slate-400",
    upcoming: "bg-warning",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? "bg-slate-400"}`} />;
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [nav, setNav] = useState<NavData | null>(null);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [showImpersonate, setShowImpersonate] = useState(false);

  const isRealAdmin = user && (user.isImpersonating || user.can_admin);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? (r.json() as Promise<{ user: User | null }>) : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => {});
    fetch("/api/nav")
      .then((r) => r.json() as Promise<NavData>)
      .then((d) => setNav(d))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpen(false);
    window.location.href = "/login";
  }

  async function handleImpersonate(playerId: string) {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    window.location.reload();
  }

  async function loadPlayers() {
    if (players.length > 0) { setShowImpersonate(!showImpersonate); return; }
    const res = await fetch("/api/admin/players");
    if (res.ok) {
      const data = (await res.json()) as { players: { id: string; name: string }[] };
      setPlayers(data.players);
      setShowImpersonate(true);
    }
  }

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <header className="bg-primary text-white sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            Greenbrook Framers
          </Link>

          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-white/70">{firstName}</span>
            )}
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
            {/* Top links */}
            <div className="space-y-1">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors font-semibold"
              >
                My Dashboard
              </Link>
              {user && (
                <Link
                  href={`/player/${user.player_id}`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  My Profile
                </Link>
              )}
              <Link
                href="/practice"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                Practice
              </Link>
            </div>

            {nav && nav.teams.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">USTA Teams</p>
                <div className="space-y-1">
                  {nav.teams.map((t) => (
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
            )}

            {nav && nav.tournaments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">Tournaments</p>
                <div className="space-y-1">
                  {nav.tournaments.map((t) => (
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
            )}

            {nav && nav.history.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">History</p>
                <div className="space-y-1">
                  {nav.history.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/${t.kind === "tournament" ? "tournament" : "team"}/${t.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <StatusDot status="completed" />
                      <span>{t.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-white/20 pt-3 space-y-1">
              {isRealAdmin && (
                <>
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Admin
                  </Link>
                  <button
                    onClick={loadPlayers}
                    className="block w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-white/80"
                  >
                    View as Player...
                  </button>
                  {showImpersonate && (
                    <div className="ml-3 max-h-48 overflow-y-auto space-y-0.5 bg-white/5 rounded-lg p-2">
                      {players.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleImpersonate(p.id)}
                          className="block w-full text-left px-2 py-1.5 rounded text-sm hover:bg-white/10 transition-colors"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {user ? (
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-white/80"
                >
                  Sign Out ({user.name})
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
