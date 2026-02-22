import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/auth";

const PLAYER_UPDATES: { id: string; email: string; phone: string | null; ntrp_rating: number; ntrp_type: string }[] = [
  { id: "624ef626-b13a-47c9-b23b-6fa96c237f47", email: "ballen636@gmail.com", phone: "949-637-0773", ntrp_rating: 3.0, ntrp_type: "3.0A" },
  { id: "5c591f7a-9f54-4e86-a507-787d2770f028", email: "lopezdc67@yahoo.com", phone: "925-207-3498", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "8dbc87ab-f415-40ee-9fed-e7857445f998", email: "hannes.magnusson@gmail.com", phone: "650-666-9246", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "92e1a868-573c-487e-93c6-3f84488a222c", email: "joegmoss@hotmail.com", phone: "510-282-8250", ntrp_rating: 2.5, ntrp_type: "2.5A" },
  { id: "ad74e6ea-ffcc-419f-8c15-3dcdf366d490", email: "jzdarko@gmail.com", phone: "805-234-4899", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "acd5a9ec-d224-466a-a6d1-7b9b28aa961b", email: "kirk.martinez@gmail.com", phone: "925-314-5089", ntrp_rating: 2.5, ntrp_type: "2.5S" },
  { id: "5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa", email: "mccabe83@gmail.com", phone: "661-433-3731", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "e200b62b-e557-47ba-98e8-1dca23d23e0e", email: "shimonmodi@gmail.com", phone: "765-409-6634", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "bbbf95a3-2773-4035-8b20-99354ab33a0d", email: "srivemuri3@gmail.com", phone: "510-338-8768", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "269a7039-5e49-47b3-a621-d4c40f3f40b5", email: "travisgilkey@gmail.com", phone: "925-787-2196", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "eb9d8bcb-ad69-43fc-87c2-d7024060185a", email: "tristanpr@gmail.com", phone: "310-749-5634", ntrp_rating: 2.5, ntrp_type: "2.5C" },
  { id: "a1b2c3d4-1111-4000-8000-000000000001", email: "juangarrahan@comcast.net", phone: "925-381-1652", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "a1b2c3d4-1111-4000-8000-000000000002", email: "guyhocker@gmail.com", phone: "310-809-1403", ntrp_rating: 3.0, ntrp_type: "3.0S" },
  { id: "a1b2c3d4-1111-4000-8000-000000000003", email: "kelly@westernstatestool.com", phone: "510-714-6117", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "a1b2c3d4-1111-4000-8000-000000000004", email: "jeffreykmoran@gmail.com", phone: "925-708-1826", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "a1b2c3d4-1111-4000-8000-000000000005", email: "bravebhaven@gmail.com", phone: "650-305-6380", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "a1b2c3d4-1111-4000-8000-000000000006", email: "jmmmat@sbcglobal.net", phone: "510-520-1515", ntrp_rating: 3.0, ntrp_type: "3.0C" },
  // 2025-only players: keep placeholder emails but make them obviously fake
  { id: "a1b2c3d4-2222-4000-8000-000000000001", email: "unknown+sandeep.b@framers.app", phone: null, ntrp_rating: 3.0, ntrp_type: "3.0S" },
  { id: "a1b2c3d4-2222-4000-8000-000000000002", email: "unknown+tim.gilliss@framers.app", phone: null, ntrp_rating: 2.5, ntrp_type: "2.5S" },
  { id: "a1b2c3d4-2222-4000-8000-000000000003", email: "unknown+kirill.mazin@framers.app", phone: null, ntrp_rating: 3.0, ntrp_type: "3.0S" },
  { id: "a1b2c3d4-2222-4000-8000-000000000004", email: "unknown+aaron.kaplan@framers.app", phone: null, ntrp_rating: 3.0, ntrp_type: "3.0C" },
  { id: "a1b2c3d4-2222-4000-8000-000000000005", email: "unknown+tom.schroder@framers.app", phone: null, ntrp_rating: 2.5, ntrp_type: "2.5S" },
];

const NEW_PLAYERS = [
  { id: "a1b2c3d4-3333-4000-8000-000000000001", name: "Stefano Mazzoni", email: "stefanoheidi@gmail.com", phone: null, ntrp_rating: 3.0, ntrp_type: "3.0S" },
  { id: "a1b2c3d4-3333-4000-8000-000000000002", name: "Jun Alarcon", email: "alarconjun@yahoo.com", phone: null, ntrp_rating: 3.0, ntrp_type: "3.0S" },
];

export async function POST() {
  const session = await getSession();
  if (!session || session.is_admin !== 1) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const db = await getDB();
  const results: string[] = [];

  // Update existing players (email, phone, ntrp)
  for (let i = 0; i < PLAYER_UPDATES.length; i += 20) {
    const batch = PLAYER_UPDATES.slice(i, i + 20);
    await db.batch(
      batch.map((p) =>
        db.prepare("UPDATE players SET email = ?, phone = ?, ntrp_rating = ?, ntrp_type = ? WHERE id = ?")
          .bind(p.email, p.phone, p.ntrp_rating, p.ntrp_type, p.id)
      )
    );
    results.push(`Updated batch ${i / 20 + 1}: ${batch.length} players`);
  }

  // Add new players
  for (const p of NEW_PLAYERS) {
    const exists = await db.prepare("SELECT id FROM players WHERE id = ?").bind(p.id).first();
    if (!exists) {
      await db.prepare(
        "INSERT INTO players (id, name, email, phone, ntrp_rating, ntrp_type, singles_elo, doubles_elo) VALUES (?,?,?,?,?,?,1500,1500)"
      ).bind(p.id, p.name, p.email, p.phone, p.ntrp_rating, p.ntrp_type).run();
      results.push(`Added new player: ${p.name}`);
    } else {
      await db.prepare("UPDATE players SET email = ?, phone = ?, ntrp_rating = ?, ntrp_type = ? WHERE id = ?")
        .bind(p.email, p.phone, p.ntrp_rating, p.ntrp_type, p.id).run();
      results.push(`Updated existing player: ${p.name}`);
    }
  }

  // Add new players to Junior Framers 2026 team
  for (const p of NEW_PLAYERS) {
    const membership = await db.prepare(
      "SELECT 1 FROM team_memberships WHERE player_id = ? AND team_id = 'team-junior-framers-2026'"
    ).bind(p.id).first();
    if (!membership) {
      await db.prepare(
        "INSERT INTO team_memberships (player_id, team_id, role) VALUES (?, 'team-junior-framers-2026', 'player')"
      ).bind(p.id).run();
      results.push(`Added ${p.name} to Junior Framers 2026`);
    }
  }

  // Shimon Modi's ELO seed needs updating (was 2.5 -> now 3.0)
  const shimon = await db.prepare("SELECT singles_elo, doubles_elo FROM players WHERE id = ?")
    .bind("e200b62b-e557-47ba-98e8-1dca23d23e0e").first<{ singles_elo: number; doubles_elo: number }>();
  if (shimon) {
    results.push(`Shimon current ELO: S=${shimon.singles_elo}, D=${shimon.doubles_elo}`);
  }

  // Verify all players now have correct data
  const allPlayers = (
    await db.prepare("SELECT id, name, email, phone, ntrp_rating, ntrp_type FROM players ORDER BY name").all()
  ).results;

  return NextResponse.json({
    ok: true,
    results,
    playerCount: allPlayers.length,
    players: allPlayers,
  });
}
