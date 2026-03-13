"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

export default function TournamentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", format: "round_robin", matchType: "singles", playerIds: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
      setLoading(false);
    });
  }, [router]);

  async function createTournament() {
    if (!form.name) { setMessage("Tournament name required"); return; }
    setCreating(true);
    const res = await fetch("/api/admin/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = (await res.json()) as { tournament: { slug: string }; matchCount: number };
      setMessage(`Tournament created with ${data.matchCount} matches`);
      setForm({ name: "", format: "round_robin", matchType: "singles", playerIds: "" });
    } else {
      const data = (await res.json()) as { error: string };
      setMessage(`Error: ${data.error}`);
    }
    setCreating(false);
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Tournaments" }]} />
      <h1 className="text-2xl font-bold">Create Tournament</h1>

      {message && (
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Spring Singles Championship"
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm">
              <option value="round_robin">Round Robin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm">
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            {form.matchType === "doubles" ? "Doubles Pairs (player1:partner1, player2:partner2)" : "Player IDs (comma-separated)"}
          </label>
          <textarea value={form.playerIds} onChange={(e) => setForm({ ...form, playerIds: e.target.value })}
            placeholder={form.matchType === "doubles" ? "playerA_id:partnerA_id, playerB_id:partnerB_id" : "Leave empty to select from roster later"}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm h-16" />
        </div>
        <button onClick={createTournament} disabled={creating}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
          {creating ? "Creating..." : "Create Tournament"}
        </button>
      </div>
    </div>
  );
}
