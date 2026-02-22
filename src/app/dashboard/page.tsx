import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Dashboard</h1>

      <section className="bg-surface-alt rounded-xl border border-border p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-3">Next Matches</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Your upcoming matches across all teams and tournaments will appear here.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/tournament/singles-championship-2026"
          className="bg-surface-alt rounded-xl border border-border p-4 hover:border-primary-light transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-accent" />
            <h3 className="font-semibold">Singles Championship</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Round-robin tournament in progress
          </p>
        </Link>

        <Link
          href="/team/senior-framers-2026"
          className="bg-surface-alt rounded-xl border border-border p-4 hover:border-primary-light transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-accent" />
            <h3 className="font-semibold">Senior Framers 40+</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            USTA NorCal 40+ 3.0 — 3 matches remaining
          </p>
        </Link>

        <Link
          href="/team/junior-framers-2026"
          className="bg-surface-alt rounded-xl border border-border p-4 hover:border-warning/30 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-warning" />
            <h3 className="font-semibold">Junior Framers 18+</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Starting April 2026
          </p>
        </Link>
      </div>
    </div>
  );
}
