"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

interface TeamOption { id: string; name: string; slug: string }

interface InterestSignup {
  id: string; team_id: string; name: string; email: string;
  phone: string | null; ntrp_rating: number | null; ntrp_type: string | null;
  notes: string | null; status: string; created_at: string;
}

export default function InterestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [signups, setSignups] = useState<InterestSignup[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
      setLoading(false);
    });
    fetch("/api/nav")
      .then((r) => r.json() as Promise<{ teams: TeamOption[] }>)
      .then((d) => setTeams(d.teams))
      .catch(() => {});
  }, [router]);

  async function loadSignups(slug: string) {
    setSelectedTeam(slug);
    const res = await fetch(`/api/team/${slug}/interest`);
    if (res.ok) {
      const data = (await res.json()) as { signups: InterestSignup[] };
      setSignups(data.signups || []);
    }
  }

  async function handleAction(interestId: string, action: "approve" | "reject") {
    setProcessing(interestId);
    const res = await fetch("/api/admin/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interestId, action }),
    });
    if (res.ok) {
      setMessage(`Signup ${action}d`);
      if (selectedTeam) loadSignups(selectedTeam);
    }
    setProcessing(null);
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Team Signups" }]} />
      <h1 className="text-2xl font-bold">Team Interest Signups</h1>

      {message && (
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm">
          {message}
        </div>
      )}

      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <select value={selectedTeam} onChange={(e) => { if (e.target.value) loadSignups(e.target.value); }}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm">
            <option value="">Select team to view signups...</option>
            {teams.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
          {selectedTeam && (
            <p className="text-xs text-slate-500 shrink-0">
              Share: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">framers.app/join/{selectedTeam}</code>
            </p>
          )}
        </div>

        {signups.length === 0 && selectedTeam && (
          <p className="text-sm text-slate-500">No signups yet for this team.</p>
        )}

        {signups.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-border">
                  <th className="text-left py-1 px-2">Name</th>
                  <th className="text-left py-1 px-2">Email</th>
                  <th className="text-center py-1 px-2">NTRP</th>
                  <th className="text-left py-1 px-2">Notes</th>
                  <th className="text-center py-1 px-2">Status</th>
                  <th className="py-1 px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {signups.map((s) => (
                  <tr key={s.id}>
                    <td className="py-1.5 px-2 font-medium">{s.name}</td>
                    <td className="py-1.5 px-2 text-slate-500">{s.email}</td>
                    <td className="py-1.5 px-2 text-center">{s.ntrp_type || "-"}</td>
                    <td className="py-1.5 px-2 text-xs text-slate-400 max-w-[200px] truncate">{s.notes || "-"}</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        s.status === "approved" ? "bg-accent/10 text-accent" :
                        s.status === "rejected" ? "bg-danger/10 text-danger" :
                        "bg-warning/10 text-warning"
                      }`}>{s.status}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {s.status === "pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => handleAction(s.id, "approve")} disabled={processing === s.id}
                            className="text-xs text-accent font-semibold">Approve</button>
                          <button onClick={() => handleAction(s.id, "reject")} disabled={processing === s.id}
                            className="text-xs text-danger font-semibold">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
