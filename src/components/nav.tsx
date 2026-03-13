"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

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

export function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [nav, setNav] = useState<NavData | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [showImpersonate, setShowImpersonate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showAdminMenu = user && user.can_admin && !user.isImpersonating;
  const canImpersonate = user && (user.isImpersonating || user.can_admin);

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

  useEffect(() => {
    setUserMenuOpen(false);
    setShowImpersonate(false);
  }, [pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
        setShowImpersonate(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
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

  const activeTeam = nav?.teams.find((t) => t.status === "active");
  const activeTournament = nav?.tournaments.find((t) => t.status === "active");
  const otherTeams = nav?.teams.filter((t) => t.slug !== activeTeam?.slug) ?? [];
  const firstName = user?.name?.split(" ")[0] ?? "";

  function navLinkClass(active: boolean) {
    return `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active
        ? "bg-white/15 text-white"
        : "text-white/70 hover:text-white hover:bg-white/10"
    }`;
  }

  return (
    <header className="bg-primary text-white sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight shrink-0">
            Greenbrook Framers
          </Link>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-1 ml-6 flex-1 min-w-0">
            <Link href="/dashboard" className={navLinkClass(pathname === "/dashboard" || pathname === "/")}>
              Home
            </Link>
            {activeTeam && (
              <Link href={`/team/${activeTeam.slug}`} className={navLinkClass(pathname.startsWith("/team/"))}>
                {activeTeam.name.replace(/\s*\d{4}$/, "")}
              </Link>
            )}
            {activeTournament && (
              <Link href={`/tournament/${activeTournament.slug}`} className={navLinkClass(pathname.startsWith("/tournament/"))}>
                Championship
              </Link>
            )}
            <Link href="/players" className={navLinkClass(pathname.startsWith("/players") || pathname.startsWith("/player/"))}>
              Players
            </Link>
            {showAdminMenu && (
              <>
                <div className="w-px h-5 bg-white/20 mx-1" />
                <Link href="/admin" className={navLinkClass(pathname.startsWith("/admin"))}>
                  Admin
                </Link>
              </>
            )}
          </div>

          {/* Desktop user dropdown */}
          <div className="hidden sm:block relative" ref={dropdownRef}>
            {user ? (
              <>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {firstName}
                  <svg className={`w-4 h-4 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden z-50">
                    <div className="p-1.5 space-y-0.5">
                      <Link href={`/player/${user.player_id}`} className="block px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        My Profile
                      </Link>
                      <Link href="/practice" className="block px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        Practice
                      </Link>
                      {otherTeams.length > 0 && (
                        <>
                          <div className="h-px bg-slate-100 dark:bg-slate-700 mx-1 my-1" />
                          <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Teams</p>
                          {otherTeams.map((t) => (
                            <Link
                              key={t.slug}
                              href={`/team/${t.slug}`}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${t.status === "active" ? "bg-accent" : "bg-warning"}`} />
                              {t.name}
                            </Link>
                          ))}
                        </>
                      )}
                      {nav && nav.history.length > 0 && (
                        <>
                          <div className="h-px bg-slate-100 dark:bg-slate-700 mx-1 my-1" />
                          <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">History</p>
                          {nav.history.map((h) => (
                            <Link
                              key={h.slug}
                              href={`/${h.kind === "tournament" ? "tournament" : "team"}/${h.slug}`}
                              className="block px-3 py-1.5 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              {h.name}
                            </Link>
                          ))}
                        </>
                      )}
                      {canImpersonate && (
                        <>
                          <div className="h-px bg-slate-100 dark:bg-slate-700 mx-1 my-1" />
                          <button
                            onClick={loadPlayers}
                            className="block w-full text-left px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                          >
                            View as Player...
                          </button>
                          {showImpersonate && (
                            <div className="max-h-40 overflow-y-auto mx-1 bg-slate-50 dark:bg-slate-900 rounded-lg p-1">
                              {players.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => handleImpersonate(p.id)}
                                  className="block w-full text-left px-2 py-1.5 rounded text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                  {p.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <div className="h-px bg-slate-100 dark:bg-slate-700 mx-1 my-1" />
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Link href="/login" className="px-3 py-1.5 rounded-lg text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                Login
              </Link>
            )}
          </div>

          {/* Mobile: just show user name, no hamburger (bottom tabs handle nav) */}
          <div className="sm:hidden">
            {user && (
              <span className="text-xs text-white/70">{firstName}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
