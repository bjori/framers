"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

interface TeamOption { id: string; name: string; slug: string }

export default function AnnouncementsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [form, setForm] = useState({ teamId: "", subject: "", body: "" });
  const [sending, setSending] = useState<"test" | "team" | false>(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.push("/login"); return; }
      const d = (await r.json()) as { user: { can_admin: boolean } | null };
      if (!d?.user?.can_admin) { router.push("/dashboard"); return; }
    });
    fetch("/api/nav")
      .then((r) => r.json() as Promise<{ teams: TeamOption[] }>)
      .then((d) => setTeams(d.teams))
      .catch(() => {});
  }, [router]);

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
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Announcements" }]} />
      <h1 className="text-2xl font-bold">Send Announcement</h1>

      <div className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
        {result && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
            result.type === "success"
              ? "bg-accent/10 border border-accent/30 text-accent"
              : "bg-danger/10 border border-danger/30 text-danger"
          }`}>
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
          <p className="text-xs text-slate-400">Sends individual emails to all active team members.</p>
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
    </div>
  );
}
