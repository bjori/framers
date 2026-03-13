import { getDB } from "@/lib/db";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { TournamentRules } from "@/components/tournament-rules";

export default async function TournamentRulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDB();

  const tournament = await db
    .prepare("SELECT id, name, slug FROM tournaments WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; name: string; slug: string }>();

  if (!tournament) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: tournament.name, href: `/tournament/${slug}` }, { label: "Rules" }]} />
        <h1 className="text-2xl font-bold">Tournament Rules</h1>
      </div>
      <TournamentRules />
    </div>
  );
}
