"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";

interface Player {
  id: string; name: string; email: string;
  ntrp_rating: number; ntrp_type: string;
  singles_elo: number; doubles_elo: number; is_admin: number;
}

export default function PlayersPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", ntrp_rating: 0, ntrp_type: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
      loadPlayers();
    });
  }, [router]);

  async function loadPlayers() {
    const res = await fetch("/api/admin/players");
    if (res.ok) {
      const data = (await res.json()) as { players: Player[] };
      setPlayers(data.players);
    }
    setLoading(false);
  }

  async function saveEdit() {
    if (!editingId) return;
    const res = await fetch("/api/admin/players", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm }),
    });
    if (res.ok) {
      setEditingId(null);
      setMessage("Player updated");
      loadPlayers();
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Players" }]} />
      <h1 className="text-2xl font-bold">Players ({players.length})</h1>

      {message && (
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="bg-surface-alt rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-border">
                <th className="text-left px-4 py-2 font-semibold">Name</th>
                <th className="text-left px-4 py-2 font-semibold">Email</th>
                <th className="text-center px-4 py-2 font-semibold">NTRP</th>
                <th className="text-center px-4 py-2 font-semibold">S-ELO</th>
                <th className="text-center px-4 py-2 font-semibold">D-ELO</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {players.map((p) => (
                <tr key={p.id}>
                  {editingId === p.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-border bg-white dark:bg-slate-900 text-sm" />
                      </td>
                      <td className="px-4 py-2">
                        <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="w-full px-2 py-1 rounded border border-border bg-white dark:bg-slate-900 text-sm" />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input value={editForm.ntrp_type} onChange={(e) => setEditForm({ ...editForm, ntrp_type: e.target.value })}
                          className="w-16 px-2 py-1 rounded border border-border bg-white dark:bg-slate-900 text-sm text-center" />
                      </td>
                      <td className="px-4 py-2 text-center text-slate-400">{p.singles_elo}</td>
                      <td className="px-4 py-2 text-center text-slate-400">{p.doubles_elo}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={saveEdit} className="text-xs text-accent font-semibold mr-2">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-medium">
                        <Link href={`/player/${p.id}`} className="hover:text-primary-light hover:underline">
                          {p.name}
                        </Link>
                        {p.is_admin === 1 && <span className="ml-1 text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-1 rounded">Admin</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{p.email}</td>
                      <td className="px-4 py-2 text-center">{p.ntrp_type}</td>
                      <td className="px-4 py-2 text-center font-mono">{p.singles_elo}</td>
                      <td className="px-4 py-2 text-center font-mono">{p.doubles_elo}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => {
                          setEditingId(p.id);
                          setEditForm({ name: p.name, email: p.email, ntrp_rating: p.ntrp_rating, ntrp_type: p.ntrp_type });
                        }} className="text-xs text-primary-light hover:underline">Edit</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
