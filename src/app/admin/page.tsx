"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Player {
  id: string;
  name: string;
  email: string;
  ntrp_rating: number;
  ntrp_type: string;
  singles_elo: number;
  doubles_elo: number;
  is_admin: number;
}

interface FeeSummary {
  id: string;
  label: string;
  amount_cents: number;
  context_type: string;
  players: { id: string; name: string; owed: number; paid: number; remaining: number }[];
}

interface TeamOption {
  id: string;
  name: string;
  slug: string;
}

interface InterestSignup {
  id: string;
  team_id: string;
  name: string;
  email: string;
  phone: string | null;
  ntrp_rating: number | null;
  ntrp_type: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

function AnnouncementSection({ setMessage }: { setMessage: (m: string) => void }) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [form, setForm] = useState({ teamId: "", subject: "", body: "" });
  const [sending, setSending] = useState<"test" | "team" | false>(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/nav")
      .then((r) => r.json() as Promise<{ teams: TeamOption[] }>)
      .then((d) => setTeams(d.teams))
      .catch(() => {});
  }, []);

  async function sendAnnouncement(testOnly?: boolean) {
    if (!form.teamId || !form.subject || !form.body) {
      setResult({ type: "error", text: "All fields are required." });
      return;
    }
    setSending(testOnly ? "test" : "team");
    setResult(null);
    try {
      const res = await fetch("/api/admin/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, testOnly }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sent: number; total: number; failed: string[]; testOnly?: boolean };
        if (data.testOnly) {
          setResult({ type: "success", text: "Test email sent! Check your inbox." });
        } else {
          const failMsg = data.failed.length > 0 ? ` (${data.failed.length} failed)` : "";
          setResult({ type: "success", text: `Sent to ${data.sent}/${data.total} members${failMsg}` });
          setForm({ ...form, subject: "", body: "" });
        }
      } else {
        const err = (await res.json()) as { error?: string };
        setResult({ type: "error", text: err.error || "Failed to send" });
      }
    } catch {
      setResult({ type: "error", text: "Network error" });
    }
    setSending(false);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Send Announcement</h2>
      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        {result && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium animate-[fadeIn_0.3s_ease-out] ${
            result.type === "success"
              ? "bg-accent/10 border border-accent/30 text-accent"
              : "bg-danger/10 border border-danger/30 text-danger"
          }`}>
            <span className="text-lg">{result.type === "success" ? "\u2713" : "\u2717"}</span>
            <span>{result.text}</span>
            <button onClick={() => setResult(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">&times;</button>
          </div>
        )}
        <select
          value={form.teamId}
          onChange={(e) => { setForm({ ...form, teamId: e.target.value }); setResult(null); }}
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
        >
          <option value="">Select team...</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          value={form.subject}
          onChange={(e) => { setForm({ ...form, subject: e.target.value }); setResult(null); }}
          placeholder="Subject line"
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
        />
        <textarea
          value={form.body}
          onChange={(e) => { setForm({ ...form, body: e.target.value }); setResult(null); }}
          placeholder="Message body (plain text, line breaks will be preserved)"
          rows={6}
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
        />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            Sends individual emails to all active team members.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => sendAnnouncement(true)}
              disabled={!!sending}
              className="px-3 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              {sending === "test" && <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {sending === "test" ? "Sending..." : "Test Send to Me"}
            </button>
            <button
              onClick={() => {
                const teamName = teams.find((t) => t.id === form.teamId)?.name ?? "the team";
                if (window.confirm(`Send "${form.subject}" to all active members of ${teamName}?`)) {
                  sendAnnouncement();
                }
              }}
              disabled={!!sending}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending === "team" && <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {sending === "team" ? "Sending..." : "Send to Team"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function InterestSection({ setMessage }: { setMessage: (m: string) => void }) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [signups, setSignups] = useState<InterestSignup[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nav")
      .then((r) => r.json() as Promise<{ teams: TeamOption[] }>)
      .then((d) => setTeams(d.teams))
      .catch(() => {});
  }, []);

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

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Team Interest Signups</h2>
      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <select
            value={selectedTeam}
            onChange={(e) => { if (e.target.value) loadSignups(e.target.value); }}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm"
          >
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
                          <button
                            onClick={() => handleAction(s.id, "approve")}
                            disabled={processing === s.id}
                            className="text-xs text-accent font-semibold"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(s.id, "reject")}
                            disabled={processing === s.id}
                            className="text-xs text-danger font-semibold"
                          >
                            Reject
                          </button>
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
    </section>
  );
}

function PaymentSection({ players, setMessage }: { players: Player[]; setMessage: (m: string) => void }) {
  const [fees, setFees] = useState<FeeSummary[]>([]);
  const [payForm, setPayForm] = useState({ feeId: "", playerId: "", amount: "" });
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    loadFees();
  }, []);

  async function loadFees() {
    try {
      const res = await fetch("/api/admin/payments");
      if (res.ok) {
        const data = (await res.json()) as { fees: FeeSummary[] };
        setFees(data.fees);
      }
    } catch { /* table may not exist */ }
  }

  async function recordPayment() {
    if (!payForm.feeId || !payForm.playerId || !payForm.amount) return;
    setRecording(true);
    const res = await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record-payment",
        feeId: payForm.feeId,
        playerId: payForm.playerId,
        amountCents: Math.round(parseFloat(payForm.amount) * 100),
      }),
    });
    if (res.ok) {
      setMessage("Payment recorded");
      setPayForm({ feeId: "", playerId: "", amount: "" });
      loadFees();
    }
    setRecording(false);
  }

  if (fees.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3">Payments</h2>
        <p className="text-sm text-slate-500">No fees set up yet. Run setup-fees via the debug API.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Payments</h2>

      {fees.map((fee) => {
        const totalOwed = fee.players.reduce((s, p) => s + p.remaining, 0);
        const totalPaid = fee.players.reduce((s, p) => s + p.paid, 0);
        return (
          <div key={fee.id} className="bg-surface-alt rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">{fee.label}</h3>
              <span className="text-xs text-slate-500">
                ${(totalPaid / 100).toFixed(0)} collected / ${((totalPaid + totalOwed) / 100).toFixed(0)} total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-border">
                    <th className="text-left py-1 px-2">Player</th>
                    <th className="text-center py-1 px-2">Owed</th>
                    <th className="text-center py-1 px-2">Paid</th>
                    <th className="text-center py-1 px-2">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {fee.players.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 px-2 font-medium">{p.name}</td>
                      <td className="py-1.5 px-2 text-center">${(p.owed / 100).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-center">${(p.paid / 100).toFixed(0)}</td>
                      <td className={`py-1.5 px-2 text-center font-bold ${p.remaining > 0 ? "text-danger" : "text-accent"}`}>
                        {p.remaining > 0 ? `$${(p.remaining / 100).toFixed(0)}` : "Paid"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        <h3 className="font-semibold text-sm">Record Payment</h3>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={payForm.feeId}
            onChange={(e) => setPayForm({ ...payForm, feeId: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-border bg-surface text-sm"
          >
            <option value="">Select fee...</option>
            {fees.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select
            value={payForm.playerId}
            onChange={(e) => setPayForm({ ...payForm, playerId: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-border bg-surface text-sm"
          >
            <option value="">Select player...</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            value={payForm.amount}
            onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
            placeholder="$ Amount"
            type="number"
            className="px-2 py-1.5 rounded-lg border border-border bg-surface text-sm"
          />
        </div>
        <button
          onClick={recordPayment}
          disabled={recording}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
        >
          {recording ? "Recording..." : "Record Payment"}
        </button>
      </div>
    </section>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", ntrp_rating: 0, ntrp_type: "" });
  const [message, setMessage] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [syncingUsta, setSyncingUsta] = useState(false);
  const [creatingTourney, setCreatingTourney] = useState(false);
  const [tourneyForm, setTourneyForm] = useState({ name: "", format: "round_robin", matchType: "singles", playerIds: "" });

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { is_admin: number; can_admin: boolean } | null };
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

  function startEdit(p: Player) {
    setEditingId(p.id);
    setEditForm({ name: p.name, email: p.email, ntrp_rating: p.ntrp_rating, ntrp_type: p.ntrp_type });
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

  async function recalculateElo() {
    setRecalculating(true);
    setMessage("");
    const res = await fetch("/api/admin/elo/recalculate", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { tournamentMatchesProcessed: number; leagueResultsProcessed: number; eloUpdates: number };
      setMessage(`ELO recalculated: ${data.tournamentMatchesProcessed} tournament + ${data.leagueResultsProcessed} league matches, ${data.eloUpdates} updates`);
      loadPlayers();
    } else {
      setMessage("Failed to recalculate ELO");
    }
    setRecalculating(false);
  }

  const [paymentData, setPaymentData] = useState<{ fees: FeeSummary[] } | null>(null);

  useEffect(() => {
    if (!loading) loadPayments();
  }, [loading]);

  async function loadPayments() {
    try {
      const res = await fetch("/api/admin/payments");
      if (res.ok) setPaymentData(await res.json() as { fees: FeeSummary[] });
    } catch { /* fees table may not exist yet */ }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <a
          href="/admin/analytics"
          className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          Analytics
        </a>
      </div>

      {message && (
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm">
          {message}
        </div>
      )}

      {/* Actions */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={recalculateElo}
            disabled={recalculating}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {recalculating ? "Recalculating..." : "Recalculate All ELO"}
          </button>
          <button
            onClick={async () => {
              setSyncingUsta(true);
              setMessage("");
              const res = await fetch("/api/admin/usta-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ teamSlug: "senior-framers-2026" }),
              });
              if (res.ok) {
                const data = (await res.json()) as { scorecards: number; updated: number };
                setMessage(`USTA sync: found ${data.scorecards} scorecards, updated ${data.updated} matches`);
              } else {
                const err = (await res.json()) as { error?: string };
                setMessage(`USTA sync failed: ${err.error || "Unknown error"}`);
              }
              setSyncingUsta(false);
            }}
            disabled={syncingUsta}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {syncingUsta ? "Syncing..." : "Sync USTA Results"}
          </button>
        </div>
      </section>

      {/* Announcements */}
      <AnnouncementSection setMessage={setMessage} />

      {/* Interest Signups */}
      <InterestSection setMessage={setMessage} />

      {/* Create Tournament */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Create Tournament</h2>
        <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={tourneyForm.name}
              onChange={(e) => setTourneyForm({ ...tourneyForm, name: e.target.value })}
              placeholder="e.g. Spring Singles Championship"
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Format</label>
              <select
                value={tourneyForm.format}
                onChange={(e) => setTourneyForm({ ...tourneyForm, format: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
              >
                <option value="round_robin">Round Robin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={tourneyForm.matchType}
                onChange={(e) => setTourneyForm({ ...tourneyForm, matchType: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm"
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {tourneyForm.matchType === "doubles" ? "Doubles Pairs (player1:partner1, player2:partner2)" : "Player IDs (comma-separated)"}
            </label>
            <textarea
              value={tourneyForm.playerIds}
              onChange={(e) => setTourneyForm({ ...tourneyForm, playerIds: e.target.value })}
              placeholder={tourneyForm.matchType === "doubles" ? "playerA_id:partnerA_id, playerB_id:partnerB_id" : "Leave empty to select from roster later"}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm h-16"
            />
          </div>
          <button
            onClick={async () => {
              if (!tourneyForm.name) { setMessage("Tournament name required"); return; }
              setCreatingTourney(true);
              const res = await fetch("/api/admin/tournaments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tourneyForm),
              });
              if (res.ok) {
                const data = (await res.json()) as { tournament: { slug: string }; matchCount: number };
                setMessage(`Tournament created with ${data.matchCount} matches`);
                setTourneyForm({ name: "", format: "round_robin", matchType: "singles", playerIds: "" });
              } else {
                const data = (await res.json()) as { error: string };
                setMessage(`Error: ${data.error}`);
              }
              setCreatingTourney(false);
            }}
            disabled={creatingTourney}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {creatingTourney ? "Creating..." : "Create Tournament"}
          </button>
        </div>
      </section>

      {/* Payment Management */}
      <PaymentSection players={players} setMessage={setMessage} />

      {/* Players */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Players ({players.length})</h2>
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
                          <input
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-border bg-white dark:bg-slate-900 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-2 py-1 rounded border border-border bg-white dark:bg-slate-900 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            value={editForm.ntrp_type}
                            onChange={(e) => setEditForm({ ...editForm, ntrp_type: e.target.value })}
                            className="w-16 px-2 py-1 rounded border border-border bg-white dark:bg-slate-900 text-sm text-center"
                          />
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
                          {p.name}
                          {p.is_admin === 1 && <span className="ml-1 text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-1 rounded">Admin</span>}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{p.email}</td>
                        <td className="px-4 py-2 text-center">{p.ntrp_type}</td>
                        <td className="px-4 py-2 text-center font-mono">{p.singles_elo}</td>
                        <td className="px-4 py-2 text-center font-mono">{p.doubles_elo}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => startEdit(p)} className="text-xs text-primary-light hover:underline">Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
