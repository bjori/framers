import { getDB } from "@/lib/db";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";

export default async function TournamentRulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDB();

  const tournament = await db
    .prepare("SELECT id, name, slug FROM tournaments WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; name: string; slug: string }>();

  if (!tournament) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Breadcrumb items={[{ label: tournament.name, href: `/tournament/${slug}` }, { label: "Rules" }]} />
        <h1 className="text-2xl font-bold">Tournament Rules</h1>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
        <p className="font-semibold text-amber-800 dark:text-amber-200">Courts are NOT Reserved!</p>
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
          The scheduled courts are <strong>not guaranteed to be available</strong>. Courts may be in use by homeowners or other residents. If your scheduled court is occupied:
        </p>
        <ul className="text-sm text-amber-700 dark:text-amber-300 mt-2 list-disc list-inside space-y-1">
          <li><strong>Wait up to 30 minutes</strong> for the court to become available</li>
          <li>If the court is still unavailable after 30 minutes, <strong>mutually reschedule the match</strong> with your opponent</li>
          <li>Be respectful of homeowners and other court users</li>
        </ul>
      </div>

      <Section title="Equipment & Balls">
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Everyone brings a fresh can of balls</strong> to each match</li>
          <li><strong>Open one can before the match begins</strong></li>
          <li><strong>Winner takes home the unopened can</strong> as a prize</li>
          <li>Players must use USTA-approved tennis balls</li>
        </ul>
      </Section>

      <Section title="Match Format & Scoring">
        <ul className="list-disc list-inside space-y-1">
          <li>Matches are <strong>best of 3 sets</strong></li>
          <li>Standard scoring: first to 6 games wins a set (must win by 2 games)</li>
          <li>At 6-6 in a set, play a <strong>7-point tiebreak</strong> (first to 7, win by 2)</li>
          <li><strong>A full tiebreaking set is encouraged and should be played by default</strong> unless there is under 30 minutes until the next match or court closing time</li>
          <li>If a third set is needed and time is limited, a 10-point super tiebreak may be played instead of a full third set (mutual agreement required)</li>
          <li><strong>Player one spins racquet for who serves</strong> at the start of the match</li>
        </ul>
      </Section>

      <Section title="Warm-up & Court Time">
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Courts are NOT reserved</strong> &mdash; they may be in use by homeowners</li>
          <li>If your scheduled court is occupied, wait up to 30 minutes or mutually reschedule</li>
          <li>Warm-up time is limited to <strong>15 minutes</strong> maximum</li>
          <li>Players should arrive on time and be ready to play at the scheduled match time</li>
          <li>If a player is more than 15 minutes late, the opponent may claim a default</li>
        </ul>
      </Section>

      <Section title="Rest Periods">
        <ul className="list-disc list-inside space-y-1">
          <li>90-second rest period between sets</li>
          <li>2-minute rest period between second and third sets</li>
          <li>Players may take a medical timeout if needed (limited to 3 minutes)</li>
        </ul>
      </Section>

      <Section title="No-Show Policy">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
          <p className="font-semibold text-red-700 dark:text-red-300 text-sm">$10 NO-SHOW FEE applies if you fail to show up for your scheduled match without at least 24 hours notice to your opponent and the tournament director.</p>
        </div>
        <ul className="list-disc list-inside space-y-1">
          <li>Contact your opponent as soon as possible if you cannot make your scheduled match</li>
          <li>Rescheduling must be agreed upon by both players and completed before the end of the tournament week</li>
          <li>If a player fails to show and cannot be reached, the match is forfeited</li>
        </ul>
      </Section>

      <Section title="Registration & Fees">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            <strong>Haven&apos;t paid your registration fee?</strong>
          </p>
          <a
            href="https://account.venmo.com/u/bjori"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            Pay Registration Fee on Venmo &rarr;
          </a>
        </div>
      </Section>

      <Section title="Code of Conduct">
        <ul className="list-disc list-inside space-y-1">
          <li>Players must conduct themselves in a sportsmanlike manner at all times</li>
          <li>Respect your opponent, officials, and other players on adjacent courts</li>
          <li>No abusive language, racquet throwing, or unsportsmanlike behavior</li>
          <li>Violations may result in point penalties, game penalties, or match default</li>
        </ul>
      </Section>

      <Section title="Line Calls & Disputes">
        <ul className="list-disc list-inside space-y-1">
          <li>Players make their own line calls on their side of the court</li>
          <li>When in doubt, the call goes in favor of your opponent</li>
          <li>If there is a dispute that cannot be resolved, replay the point</li>
          <li>Players may request a line judge for critical points if available</li>
        </ul>
      </Section>

      <Section title="Rescheduling Matches">
        <ul className="list-disc list-inside space-y-1">
          <li><strong>If you need to reschedule, reach out to your opponent and agree to a new date/time. Do not &quot;postpone&quot; matches without setting a date.</strong></li>
          <li>Matches may be rescheduled by mutual agreement of both players</li>
          <li>Rescheduled matches must be completed within the tournament week</li>
          <li>Use the match detail page to update match date/time</li>
          <li>If players cannot agree on a reschedule time, the original scheduled time stands</li>
        </ul>
      </Section>

      <Section title="Forfeits & Defaults">
        <ul className="list-disc list-inside space-y-1">
          <li>A match is forfeited if a player fails to show up (see No-Show Policy above)</li>
          <li>If a player retires due to injury, the opponent wins the match</li>
          <li>If a player is disqualified for code of conduct violations, the opponent wins 6-0, 6-0</li>
          <li>All forfeits count as a 6-0, 6-0 win for the opponent</li>
        </ul>
      </Section>

      <Section title="Score Reporting">
        <ul className="list-disc list-inside space-y-1">
          <li>Winners are responsible for reporting scores on the match detail page</li>
          <li>Scores must be reported within 24 hours of match completion</li>
          <li>Report scores from the winner&apos;s perspective (e.g., &quot;6-4, 7-5&quot;)</li>
          <li>If a match is a forfeit/no-show, mark it as a forfeit in the score form</li>
        </ul>
      </Section>

      <Section title="Standings & Tiebreakers">
        <ul className="list-disc list-inside space-y-1">
          <li>Standings are based on: matches won, then sets won, then games won</li>
          <li>Head-to-head record is used to break ties when applicable</li>
          <li>Standings are updated automatically as scores are reported</li>
        </ul>
      </Section>

      <div className="border-t border-border pt-4 text-sm text-slate-500 dark:text-slate-400">
        Questions or issues? Contact the tournament director.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface-alt rounded-xl border border-border p-4 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm text-foreground/80 leading-relaxed">{children}</div>
    </section>
  );
}
