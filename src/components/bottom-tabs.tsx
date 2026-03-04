"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
}

interface PlayerOption {
  id: string;
  name: string;
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 11-1.06 1.06l-.97-.97V19.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-4.5h-3v4.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-6.88l-.97.97a.75.75 0 01-1.06-1.06l8.69-8.69z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      )}
    </svg>
  );
}

function TeamIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      )}
    </svg>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5}>
      {active ? (
        <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a.75.75 0 000 1.5h12.17a.75.75 0 000-1.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.707 6.707 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.22 49.22 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744z" clipRule="evenodd" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .982-3.172M8.25 8.25c-1.875 0-3.75-.75-3.75-3V3h15v2.25c0 2.25-1.875 3-3.75 3" />
      )}
    </svg>
  );
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      {active ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      )}
    </svg>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [nav, setNav] = useState<NavData | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

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

  if (!user) return null;
  if (pathname === "/login") return null;

  const activeTeam = nav?.teams.find((t) => t.status === "active");
  const activeTournament = nav?.tournaments.find((t) => t.status === "active");
  const teamHref = activeTeam ? `/team/${activeTeam.slug}` : "/dashboard";
  const tournamentHref = activeTournament ? `/tournament/${activeTournament.slug}` : null;
  const otherTeams = nav?.teams.filter((t) => t.slug !== activeTeam?.slug) ?? [];

  const isHome = pathname === "/dashboard" || pathname === "/";
  const isTeam = pathname.startsWith("/team/");
  const isTournament = pathname.startsWith("/tournament/");

  const tabs = [
    { key: "home", label: "Home", href: "/dashboard", active: isHome, icon: HomeIcon },
    { key: "team", label: activeTeam?.name?.replace(/\s*\d{4}$/, "") ?? "Team", href: teamHref, active: isTeam, icon: TeamIcon },
    ...(tournamentHref
      ? [{ key: "tournament", label: "Championship", href: tournamentHref, active: isTournament, icon: TrophyIcon }]
      : []),
    { key: "more", label: "More", href: "#", active: moreOpen, icon: MoreIcon },
  ];

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden" onClick={() => setMoreOpen(false)} />
      )}

      {moreOpen && (
        <div className="fixed bottom-14 left-0 right-0 z-40 sm:hidden animate-in slide-in-from-bottom-4 duration-200">
          <div className="mx-2 mb-1 bg-white dark:bg-slate-900 rounded-2xl border border-border shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto">
            <div className="p-2 space-y-0.5">
              <Link
                href={`/player/${user.player_id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <span className="text-sm font-medium">My Profile</span>
              </Link>
              <Link
                href="/practice"
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                <span className="text-sm font-medium">Practice</span>
              </Link>

              {nav && otherTeams.length > 0 && (
                <>
                  <div className="h-px bg-border mx-2 my-1" />
                  <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Teams</p>
                  {otherTeams.map((t) => (
                    <Link
                      key={t.slug}
                      href={`/team/${t.slug}`}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full ${t.status === "active" ? "bg-accent" : "bg-warning"}`} />
                      <span className="text-sm font-medium">{t.name}</span>
                    </Link>
                  ))}
                </>
              )}

              {isRealAdmin && (
                <>
                  <div className="h-px bg-border mx-2 my-1" />
                  <Link
                    href="/admin"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    <span className="text-sm font-medium">Admin Panel</span>
                  </Link>
                  <Link
                    href="/admin/analytics"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                    </svg>
                    <span className="text-sm font-medium">Analytics</span>
                  </Link>
                  <button
                    onClick={loadPlayers}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors w-full text-left"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    <span className="text-sm font-medium">View as Player...</span>
                  </button>
                  {showImpersonate && (
                    <div className="ml-8 mr-2 max-h-40 overflow-y-auto space-y-0.5 bg-slate-50 dark:bg-slate-800 rounded-xl p-1.5">
                      {players.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleImpersonate(p.id)}
                          className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {nav && nav.history.length > 0 && (
                <>
                  <div className="h-px bg-border mx-2 my-1" />
                  <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">History</p>
                  {nav.history.map((h) => (
                    <Link
                      key={h.slug}
                      href={`/${h.kind === "tournament" ? "tournament" : "team"}/${h.slug}`}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{h.name}</span>
                    </Link>
                  ))}
                </>
              )}

              <div className="h-px bg-border mx-2 my-1" />
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors w-full text-left text-red-600 dark:text-red-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
                </svg>
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-border">
          <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-2">
            {tabs.map((tab) =>
              tab.key === "more" ? (
                <button
                  key={tab.key}
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
                    tab.active ? "text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  <tab.icon active={tab.active} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              ) : (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
                    tab.active ? "text-sky-600 dark:text-sky-400" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  <tab.icon active={tab.active} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </Link>
              )
            )}
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)] bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg" />
      </nav>
    </>
  );
}
