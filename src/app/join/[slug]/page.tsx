"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface TeamInfo {
  name: string;
  slug: string;
  league: string;
  season_year: number;
  season_start: string;
  status: string;
}

export default function JoinTeamPage() {
  const { slug } = useParams<{ slug: string }>();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [count, setCount] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", phone: "", ntrpRating: "3.0", ntrpType: "3.0S", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/team/${slug}/info`)
      .then((r) => r.ok ? (r.json() as Promise<{ team: TeamInfo }>) : null)
      .then((d) => { if (d) setTeam(d.team); })
      .catch(() => {});
    fetch(`/api/team/${slug}/interest`)
      .then((r) => r.ok ? (r.json() as Promise<{ count: number }>) : null)
      .then((d) => { if (d) setCount(d.count); })
      .catch(() => {});
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email) { setError("Name and email are required"); return; }
    setSubmitting(true);
    const res = await fetch(`/api/team/${slug}/interest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        ntrpRating: parseFloat(form.ntrpRating),
        ntrpType: form.ntrpType,
        notes: form.notes || undefined,
      }),
    });
    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error || "Something went wrong");
    }
    setSubmitting(false);
  }

  if (!team) return <div className="p-8 text-center text-slate-500">Loading...</div>;

  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4">
        <div className="text-5xl">&#127934;</div>
        <h1 className="text-2xl font-bold">You&apos;re on the list!</h1>
        <p className="text-slate-500">
          Thanks for signing up for <strong>{team.name}</strong>. The captain will review your signup
          and you&apos;ll be added to the team roster when confirmed.
        </p>
        <Link href="/dashboard" className="inline-block px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Join {team.name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {team.league} &middot; {team.season_year} season
          {team.season_start ? ` starting ${new Date(team.season_start + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}` : ""}
        </p>
        {count > 0 && (
          <p className="text-xs text-slate-400 mt-1">{count} player{count !== 1 ? "s" : ""} already signed up</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-alt rounded-xl border border-border p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Full Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your full name"
            required
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="your@email.com"
            required
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="555-123-4567"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">NTRP Rating</label>
            <select
              value={form.ntrpRating}
              onChange={(e) => setForm({ ...form, ntrpRating: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm"
            >
              <option value="2.5">2.5</option>
              <option value="3.0">3.0</option>
              <option value="3.5">3.5</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rating Type</label>
            <select
              value={form.ntrpType}
              onChange={(e) => setForm({ ...form, ntrpType: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm"
            >
              <option value="3.0S">Self-rated</option>
              <option value="3.0C">Computer-rated</option>
              <option value="3.0A">Appeal-rated</option>
              <option value="2.5S">2.5 Self</option>
              <option value="2.5C">2.5 Computer</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Any preferences? (e.g. I only want to play doubles, availability constraints, etc.)"
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-surface text-sm"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg bg-primary text-white font-bold text-sm disabled:opacity-50 transition-colors hover:bg-primary-light"
        >
          {submitting ? "Signing up..." : "Sign Up for the Team"}
        </button>
      </form>
    </div>
  );
}
