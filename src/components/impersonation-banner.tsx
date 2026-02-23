"use client";

import { useState, useEffect } from "react";

interface AuthMe {
  user: {
    player_id: string;
    name: string;
    is_admin: number;
    isImpersonating?: boolean;
    realAdminName?: string;
  } | null;
}

export function ImpersonationBanner() {
  const [data, setData] = useState<AuthMe | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? (r.json() as Promise<AuthMe>) : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  if (!data?.user?.isImpersonating) return null;

  async function stopImpersonating() {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    window.location.reload();
  }

  return (
    <div className="bg-yellow-400 text-yellow-900 text-center text-sm font-semibold py-1.5 px-4 flex items-center justify-center gap-3 z-[60] relative">
      <span>Viewing as {data.user.name}</span>
      <button
        onClick={stopImpersonating}
        className="bg-yellow-900 text-yellow-100 text-xs font-bold px-2 py-0.5 rounded hover:bg-yellow-800 transition-colors"
      >
        Stop
      </button>
    </div>
  );
}
