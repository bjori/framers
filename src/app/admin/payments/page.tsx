"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

interface Player { id: string; name: string }

interface FeeSummary {
  id: string; label: string; amount_cents: number; context_type: string;
  players: { id: string; name: string; owed: number; paid: number; remaining: number }[];
}

export default function PaymentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<FeeSummary[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [payForm, setPayForm] = useState({ feeId: "", playerId: "", amount: "" });
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
      loadData();
    });
  }, [router]);

  async function loadData() {
    const [feesRes, playersRes] = await Promise.all([
      fetch("/api/admin/payments").catch(() => null),
      fetch("/api/admin/players").catch(() => null),
    ]);
    if (feesRes?.ok) {
      const d = (await feesRes.json()) as { fees: FeeSummary[] };
      setFees(d.fees);
    }
    if (playersRes?.ok) {
      const d = (await playersRes.json()) as { players: Player[] };
      setPlayers(d.players);
    }
    setLoading(false);
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
      loadData();
    }
    setRecording(false);
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Payments" }]} />
      <h1 className="text-2xl font-bold">Payments</h1>

      {message && (
        <div className="bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 rounded-lg px-4 py-2 text-sm">
          {message}
        </div>
      )}

      {fees.length === 0 ? (
        <p className="text-sm text-slate-500">No fees set up yet.</p>
      ) : (
        <>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={payForm.feeId} onChange={(e) => setPayForm({ ...payForm, feeId: e.target.value })}
                className="px-2 py-1.5 rounded-lg border border-border bg-surface text-sm">
                <option value="">Select fee...</option>
                {fees.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select value={payForm.playerId} onChange={(e) => setPayForm({ ...payForm, playerId: e.target.value })}
                className="px-2 py-1.5 rounded-lg border border-border bg-surface text-sm">
                <option value="">Select player...</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                placeholder="$ Amount" type="number"
                className="px-2 py-1.5 rounded-lg border border-border bg-surface text-sm" />
            </div>
            <button onClick={recordPayment} disabled={recording}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
              {recording ? "Recording..." : "Record Payment"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
