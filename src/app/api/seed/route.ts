import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = env.DB;

    // Check if already seeded
    const existing = await db.prepare("SELECT count(*) as cnt FROM players").first<{ cnt: number }>();
    if (existing && existing.cnt > 0) {
      return NextResponse.json({ ok: true, message: "Already seeded", players: existing.cnt });
    }

    // Batch 1: Players (with real emails, phones, and 2026 USTA ratings)
    const pInsert = "INSERT INTO players (id,name,email,phone,ntrp_rating,ntrp_type,is_admin) VALUES (?,?,?,?,?,?,?)";
    await db.batch([
      db.prepare(pInsert).bind("624ef626-b13a-47c9-b23b-6fa96c237f47","Brad Allen","ballen636@gmail.com","949-637-0773",3.0,"3.0A",0),
      db.prepare(pInsert).bind("5c591f7a-9f54-4e86-a507-787d2770f028","Dan Lopez","lopezdc67@yahoo.com","925-207-3498",3.0,"3.0C",0),
      db.prepare(pInsert).bind("8dbc87ab-f415-40ee-9fed-e7857445f998","Hannes Magnusson","hannes.magnusson@gmail.com","650-666-9246",3.0,"3.0C",1),
      db.prepare(pInsert).bind("92e1a868-573c-487e-93c6-3f84488a222c","Joe Moss","joegmoss@hotmail.com","510-282-8250",2.5,"2.5A",0),
      db.prepare(pInsert).bind("ad74e6ea-ffcc-419f-8c15-3dcdf366d490","Joel Zdarko","jzdarko@gmail.com","805-234-4899",3.0,"3.0C",0),
      db.prepare(pInsert).bind("acd5a9ec-d224-466a-a6d1-7b9b28aa961b","Kirk Martinez","kirk.martinez@gmail.com","925-314-5089",2.5,"2.5S",0),
      db.prepare(pInsert).bind("5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa","Matthew McCabe","mccabe83@gmail.com","661-433-3731",3.0,"3.0C",0),
      db.prepare(pInsert).bind("e200b62b-e557-47ba-98e8-1dca23d23e0e","Shimon Modi","shimonmodi@gmail.com","765-409-6634",3.0,"3.0C",0),
      db.prepare(pInsert).bind("bbbf95a3-2773-4035-8b20-99354ab33a0d","Sri Vemuri","srivemuri3@gmail.com","510-338-8768",3.0,"3.0C",0),
      db.prepare(pInsert).bind("269a7039-5e49-47b3-a621-d4c40f3f40b5","Travis Gilkey","travisgilkey@gmail.com","925-787-2196",3.0,"3.0C",0),
      db.prepare(pInsert).bind("eb9d8bcb-ad69-43fc-87c2-d7024060185a","Tristan Pereida-Rice","tristanpr@gmail.com","310-749-5634",2.5,"2.5C",0),
      db.prepare(pInsert).bind("a1b2c3d4-1111-4000-8000-000000000001","Juan Garrahan","juangarrahan@comcast.net","925-381-1652",3.0,"3.0C",0),
      db.prepare(pInsert).bind("a1b2c3d4-1111-4000-8000-000000000002","Guy Hocker","guyhocker@gmail.com","310-809-1403",3.0,"3.0S",0),
      db.prepare(pInsert).bind("a1b2c3d4-1111-4000-8000-000000000003","Kelly Lynch","kelly@westernstatestool.com","510-714-6117",3.0,"3.0C",0),
      db.prepare(pInsert).bind("a1b2c3d4-1111-4000-8000-000000000004","Jeff Moran","jeffreykmoran@gmail.com","925-708-1826",3.0,"3.0C",0),
      db.prepare(pInsert).bind("a1b2c3d4-1111-4000-8000-000000000005","Bhaven Shah","bravebhaven@gmail.com","650-305-6380",3.0,"3.0C",0),
      db.prepare(pInsert).bind("a1b2c3d4-1111-4000-8000-000000000006","Jeff Turner","jmmmat@sbcglobal.net","510-520-1515",3.0,"3.0C",0),
      db.prepare(pInsert).bind("a1b2c3d4-3333-4000-8000-000000000001","Stefano Mazzoni","stefanoheidi@gmail.com",null,3.0,"3.0S",0),
      db.prepare(pInsert).bind("a1b2c3d4-3333-4000-8000-000000000002","Jun Alarcon","alarconjun@yahoo.com",null,3.0,"3.0S",0),
      db.prepare(pInsert).bind("a1b2c3d4-2222-4000-8000-000000000001","Sandeep Brahmarouthu","unknown+sandeep.b@framers.app",null,3.0,"3.0S",0),
    ]);
    await db.batch([
      db.prepare(pInsert).bind("a1b2c3d4-2222-4000-8000-000000000002","Tim Gilliss","unknown+tim.gilliss@framers.app",null,2.5,"2.5S",0),
      db.prepare(pInsert).bind("a1b2c3d4-2222-4000-8000-000000000003","Kirill Mazin","unknown+kirill.mazin@framers.app",null,3.0,"3.0S",0),
      db.prepare(pInsert).bind("a1b2c3d4-2222-4000-8000-000000000004","Aaron Kaplan","unknown+aaron.kaplan@framers.app",null,3.0,"3.0C",0),
      db.prepare(pInsert).bind("a1b2c3d4-2222-4000-8000-000000000005","Tom Schroder","unknown+tom.schroder@framers.app",null,2.5,"2.5S",0),
    ]);

    // Batch 2: Teams + Tournament
    await db.batch([
      db.prepare("INSERT INTO teams (id,name,slug,league,season_year,season_start,season_end,match_format,usta_team_id,status) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("team-senior-framers-2026","Senior Framers","senior-framers-2026","USTA NorCal 40+ 3.0",2026,"2026-01-09","2026-03-15",'{"singles":1,"doubles":3}',"108477","active"),
      db.prepare("INSERT INTO teams (id,name,slug,league,season_year,season_start,season_end,match_format,usta_team_id,status) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("team-junior-framers-2026","Junior Framers","junior-framers-2026","USTA NorCal 18+ 3.0",2026,"2026-04-07","2026-06-15",'{"singles":2,"doubles":3}',"110060","upcoming"),
      db.prepare("INSERT INTO teams (id,name,slug,league,season_year,season_start,season_end,match_format,usta_team_id,status) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("team-the-framers-2025","The Framers (2025)","the-framers-2025","USTA NorCal 40+ 3.0",2025,"2025-01-06","2025-03-16",'{"singles":1,"doubles":3}',"104737","completed"),
      db.prepare("INSERT INTO teams (id,name,slug,league,season_year,season_start,season_end,match_format,usta_team_id,status) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("team-youth-framers-2025","Youth Framers (2025)","youth-framers-2025","USTA NorCal 18+ 3.0",2025,"2025-04-07","2025-06-15",'{"singles":2,"doubles":3}',"106311","completed"),
      db.prepare("INSERT INTO tournaments (id,name,slug,format,match_type,scoring_format,status,start_date,end_date,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("tourney-singles-championship-2026","Greenbrook Singles Championship 2026","singles-championship-2026","round_robin","singles","best_of_3","active","2026-01-12","2026-03-24","8dbc87ab-f415-40ee-9fed-e7857445f998"),
    ]);

    // Batch 3: Team memberships (Senior Framers 2026)
    const seniorPlayers = [
      "8dbc87ab-f415-40ee-9fed-e7857445f998",
      "624ef626-b13a-47c9-b23b-6fa96c237f47","5c591f7a-9f54-4e86-a507-787d2770f028",
      "92e1a868-573c-487e-93c6-3f84488a222c","ad74e6ea-ffcc-419f-8c15-3dcdf366d490",
      "acd5a9ec-d224-466a-a6d1-7b9b28aa961b","5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa",
      "e200b62b-e557-47ba-98e8-1dca23d23e0e","bbbf95a3-2773-4035-8b20-99354ab33a0d",
      "269a7039-5e49-47b3-a621-d4c40f3f40b5","eb9d8bcb-ad69-43fc-87c2-d7024060185a",
      "a1b2c3d4-1111-4000-8000-000000000001","a1b2c3d4-1111-4000-8000-000000000002",
      "a1b2c3d4-1111-4000-8000-000000000003","a1b2c3d4-1111-4000-8000-000000000004",
      "a1b2c3d4-1111-4000-8000-000000000005","a1b2c3d4-1111-4000-8000-000000000006",
    ];
    await db.batch(seniorPlayers.map((pid, i) =>
      db.prepare("INSERT INTO team_memberships (player_id,team_id,role) VALUES (?,?,?)").bind(pid, "team-senior-framers-2026", i === 0 ? "captain" : "player")
    ));

    // Batch 4: Tournament participants
    const tpMap = [
      ["tp-brad","624ef626-b13a-47c9-b23b-6fa96c237f47"],
      ["tp-dan","5c591f7a-9f54-4e86-a507-787d2770f028"],
      ["tp-hannes","8dbc87ab-f415-40ee-9fed-e7857445f998"],
      ["tp-joe","92e1a868-573c-487e-93c6-3f84488a222c"],
      ["tp-joel","ad74e6ea-ffcc-419f-8c15-3dcdf366d490"],
      ["tp-kirk","acd5a9ec-d224-466a-a6d1-7b9b28aa961b"],
      ["tp-matt","5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa"],
      ["tp-shimon","e200b62b-e557-47ba-98e8-1dca23d23e0e"],
      ["tp-sri","bbbf95a3-2773-4035-8b20-99354ab33a0d"],
      ["tp-travis","269a7039-5e49-47b3-a621-d4c40f3f40b5"],
      ["tp-tristan","eb9d8bcb-ad69-43fc-87c2-d7024060185a"],
    ] as const;
    await db.batch(tpMap.map(([tpId, pid]) =>
      db.prepare("INSERT INTO tournament_participants (id,tournament_id,player_id) VALUES (?,?,?)").bind(tpId, "tourney-singles-championship-2026", pid)
    ));

    // Batch 5: League matches (Senior Framers 2026)
    const leagueMatches = [
      ["lm-sf26-01",1,"PLEASANTON 40AM3.0A","2026-01-09","18:30","Greenbrook",1,"Lost","0-5","completed"],
      ["lm-sf26-02",2,"CROW CANYON CC 40AM3.0A","2026-01-17",null,"Crow Canyon CC",0,"Lost","2-3","completed"],
      ["lm-sf26-03",3,"BLACKHAWK CC 40AM3.0A","2026-01-25",null,"Blackhawk CC",0,"Lost","0-5","completed"],
      ["lm-sf26-04",4,"DUBLIN HS 40AM3.0A","2026-01-30","18:30","Greenbrook",1,"Won","4-1","completed"],
      ["lm-sf26-05",5,"FREMONT TC 40AM3.0A","2026-02-03",null,"Fremont TC",0,"Lost","1-4","completed"],
      ["lm-sf26-06",6,"DIABLO CC 40AM3.0A","2026-02-13","18:30","Greenbrook",1,"Won","5-0","completed"],
      ["lm-sf26-07",7,"DOUGHERTY VALLEY HS 40AM3.0A","2026-02-20","18:30","Greenbrook",1,"Lost","0-5","completed"],
      ["lm-sf26-08",8,"PLEASANTON 40AM3.0D","2026-03-01",null,"Pleasanton",0,null,null,"open"],
      ["lm-sf26-09",9,"PLEASANTON 40AM3.0B","2026-03-06","18:30","Greenbrook",1,null,null,"open"],
      ["lm-sf26-10",10,"PLEASANTON 40AM3.0C","2026-03-15",null,"Pleasanton",0,null,null,"open"],
    ] as const;
    await db.batch(leagueMatches.map(([id,rn,opp,dt,tm,loc,home,result,score,status]) =>
      db.prepare("INSERT INTO league_matches (id,team_id,round_number,opponent_team,match_date,match_time,location,is_home,team_result,team_score,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,"team-senior-framers-2026",rn,opp,dt,tm,loc,home,result,score,status)
    ));

    // Batch 6-8: Tournament matches (55 total, split into batches)
    const tmInsert = "INSERT INTO tournament_matches (id,tournament_id,round,match_number,week,participant1_id,participant2_id,winner_participant_id,score1_sets,score2_sets,scheduled_date,scheduled_time,court,status,bye) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const tid = "tourney-singles-championship-2026";

    // Completed matches (25)
    await db.batch([
      db.prepare(tmInsert).bind("acdcd06c-6b2a-4a34-ad13-a63316022ab2",tid,1,1,1,"tp-dan","tp-tristan","tp-dan","[6,6]","[2,3]","2026-01-12","20:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("e58ff5b3-afc5-4406-8215-2e2b1eb963c7",tid,1,2,1,"tp-joe","tp-sri","tp-sri","[3,3]","[6,6]","2026-01-13","20:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("f41cd817-331e-4087-8510-df4b84f1fd92",tid,1,3,1,"tp-joel","tp-shimon","tp-shimon","[3,4]","[6,6]","2026-01-13","20:00","Court 2","completed",0),
      db.prepare(tmInsert).bind("95ce7507-ce81-4a57-b28d-d1c941faa8d0",tid,1,4,1,"tp-kirk","tp-matt","tp-matt","[2,1]","[6,6]","2026-01-13","20:00","Court 3","completed",0),
      db.prepare(tmInsert).bind("3a69f41a-8739-4215-99f4-2ab7e09a159e",tid,1,5,1,"tp-hannes","tp-travis","tp-hannes","[6,6]","[1,1]","2026-01-14","18:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("0262236e-6921-435d-82da-68b44b755b80",tid,2,1,2,"tp-joe","tp-matt","tp-matt","[3,2]","[6,6]","2026-01-19","10:30","Court 2","completed",0),
      db.prepare(tmInsert).bind("0d30d173-4cbd-407c-80be-591f782ada9e",tid,2,2,2,"tp-brad","tp-tristan","tp-brad","[6,6]","[1,1]","2026-01-20","18:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("5d019265-0084-45fe-91c0-854534560a2e",tid,2,3,2,"tp-dan","tp-sri","tp-sri","[1,4]","[6,6]","2026-01-20","18:00","Court 2","completed",0),
      db.prepare(tmInsert).bind("50adb21c-8466-4925-b068-5c756e3dd9fd",tid,2,4,2,"tp-joel","tp-kirk","tp-joel","[6,6]","[0,2]","2026-01-20","20:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("7dfa3367-1d61-4a27-ada6-6e3d0dbf0746",tid,2,5,2,"tp-hannes","tp-shimon","tp-shimon","[2,1]","[6,6]","2026-01-28","19:30","Court 1","completed",0),
      db.prepare(tmInsert).bind("ca4b7e38-5287-423c-ad8d-1216657ee08b",tid,3,1,3,"tp-joe","tp-joel","tp-joel","[0,2]","[6,6]","2026-01-24","10:30","Court 2","completed",0),
      db.prepare(tmInsert).bind("0b394107-9ed5-4ea6-bbc3-ad63f18c42b8",tid,3,2,3,"tp-brad","tp-travis","tp-brad","[6,6]","[2,1]","2026-01-27","18:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("5e806ff2-0b65-4584-81a4-168241f0bf8d",tid,3,3,3,"tp-tristan","tp-sri","tp-sri","[2,1]","[6,6]","2026-01-27","18:00","Court 2","completed",0),
    ]);

    await db.batch([
      db.prepare(tmInsert).bind("a2ba64a6-f3f0-4276-9f89-b44e375306e9",tid,3,4,3,"tp-dan","tp-matt","tp-matt","[3,1]","[6,6]","2026-01-27","20:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("16334deb-6884-4de5-b44a-4501cb36af06",tid,3,5,3,"tp-hannes","tp-kirk","tp-hannes","[6,6]","[1,0]","2026-01-27","20:00","Court 2","completed",0),
      db.prepare(tmInsert).bind("673b8d4a-bf6c-4a43-beaa-bb5f2eadd855",tid,4,1,4,"tp-brad","tp-sri","tp-brad","[4,6,14]","[6,3,12]","2026-02-03","18:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("4288938e-4d7b-454c-9ef4-f8fe60afb143",tid,4,2,4,"tp-travis","tp-shimon","tp-shimon","[2,1]","[6,6]","2026-02-03","18:00","Court 2","completed",0),
      db.prepare(tmInsert).bind("0d002bf2-5f36-4f5b-925f-7473a9ee69ba",tid,4,3,4,"tp-hannes","tp-joe","tp-hannes","[6,6]","[1,1]","2026-02-04","11:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("c89e2695-c2fa-4787-9d1b-13a1712ee13b",tid,4,4,4,"tp-tristan","tp-matt","tp-matt","[0,2]","[6,6]","2026-02-05","18:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("e446039a-cba4-4554-b3d6-e6f8e1a13292",tid,4,5,4,"tp-dan","tp-joel","tp-joel","[1,2]","[6,6]","2026-02-05","19:30","Court 2","completed",0),
      db.prepare(tmInsert).bind("a5e47964-cd28-4c97-9e34-14a60da2ddf0",tid,5,1,5,"tp-brad","tp-shimon","tp-shimon","[1,1]","[6,6]","2026-02-10","18:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("ebeb62e8-8a4b-4008-9e8c-2f42dc49bbca",tid,5,2,5,"tp-sri","tp-matt","tp-matt","[0,3]","[6,6]","2026-02-12","18:00","Court 2","completed",0),
      db.prepare(tmInsert).bind("d67e0e74-ddd8-4c55-9d6c-eddc4c20b2f7",tid,5,3,5,"tp-dan","tp-hannes","tp-hannes","[1,1]","[6,6]","2026-02-12","20:00","Court 1","completed",0),
      db.prepare(tmInsert).bind("cef051a2-5742-4212-9600-aafa7f0979a1",tid,5,4,5,"tp-travis","tp-kirk","tp-travis","[6,6]","[2,3]","2026-02-13","18:00","Court 3","completed",0),
      db.prepare(tmInsert).bind("134e3e01-cc5b-4621-82b1-4e776377dcee",tid,5,5,5,"tp-tristan","tp-joel","tp-joel","[0,0]","[6,6]","2026-02-21","13:00","Court 2","completed",0),
    ]);

    // Scheduled matches (30) - weeks 6-11
    const sched = "INSERT INTO tournament_matches (id,tournament_id,round,match_number,week,participant1_id,participant2_id,scheduled_date,scheduled_time,court,status,bye) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
    await db.batch([
      db.prepare(sched).bind("aa61a481-9baa-4471-81f6-d5e2da38261d",tid,6,1,6,"tp-brad","tp-matt","2026-02-17","18:00","Court 1","scheduled",0),
      db.prepare(sched).bind("251e5d94-1727-4146-80ea-9a6aa6b6e543",tid,6,2,6,"tp-shimon","tp-kirk","2026-02-17","18:00","Court 2","scheduled",0),
      db.prepare(sched).bind("99937112-0281-4f58-8d67-eb4b53141591",tid,6,3,6,"tp-sri","tp-joel","2026-02-17","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("68bc52b5-8268-4729-868e-617dc749c65a",tid,6,4,6,"tp-travis","tp-joe","2026-02-17","20:00","Court 2","scheduled",0),
      db.prepare(sched).bind("ed269a81-6608-46c9-9a64-0e165bae3ed6",tid,6,5,6,"tp-tristan","tp-hannes","2026-02-26","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("de199b97-b433-41dc-af49-773eaa030ad9",tid,7,1,7,"tp-brad","tp-kirk","2026-02-24","18:00","Court 1","scheduled",0),
      db.prepare(sched).bind("9b3802ce-bc8e-4f39-ab7f-842bd01823df",tid,7,2,7,"tp-matt","tp-joel","2026-02-24","18:00","Court 2","scheduled",0),
      db.prepare(sched).bind("6bdb7757-97f2-41c1-8b63-aabffa3e157a",tid,7,3,7,"tp-shimon","tp-joe","2026-02-24","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("75329cb6-0e74-4d8e-bc5c-6f9d9a70555b",tid,7,4,7,"tp-sri","tp-hannes","2026-02-24","20:00","Court 2","scheduled",0),
      db.prepare(sched).bind("87c1dd67-02dc-4c75-8f1a-b53d09e63b44",tid,7,5,7,"tp-travis","tp-dan","2026-02-24","20:00","Court 3","scheduled",0),
      db.prepare(sched).bind("50d8f3db-29c4-4502-b199-371d202df825",tid,8,1,8,"tp-brad","tp-joel","2026-03-03","18:00","Court 1","scheduled",0),
      db.prepare(sched).bind("3ab27fc2-89b5-4b1b-9d19-6e81020124f5",tid,8,2,8,"tp-kirk","tp-joe","2026-03-03","18:00","Court 2","scheduled",0),
      db.prepare(sched).bind("121624df-00cc-4102-98fc-3750b7684564",tid,8,3,8,"tp-matt","tp-hannes","2026-03-03","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("264ba028-d648-4037-a3c6-03c965d2a646",tid,8,4,8,"tp-shimon","tp-dan","2026-03-03","20:00","Court 2","scheduled",0),
      db.prepare(sched).bind("71ee89ff-5a55-4ed6-942e-fa4ff5122273",tid,8,5,8,"tp-travis","tp-tristan","2026-03-03","20:00","Court 3","scheduled",0),
    ]);

    await db.batch([
      db.prepare(sched).bind("e2414be1-4d18-4cd0-b7b9-3b22363618c2",tid,9,1,9,"tp-brad","tp-joe","2026-03-10","18:00","Court 1","scheduled",0),
      db.prepare(sched).bind("1ed9b0ea-3fb8-4f30-af36-d11dca1eb4db",tid,9,2,9,"tp-joel","tp-hannes","2026-03-10","18:00","Court 2","scheduled",0),
      db.prepare(sched).bind("084ff6dc-855d-4bcd-a780-6297df69539f",tid,9,3,9,"tp-kirk","tp-dan","2026-03-10","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("f9f15bf0-5280-4a3d-9516-fa8e02558774",tid,9,4,9,"tp-shimon","tp-tristan","2026-03-10","20:00","Court 2","scheduled",0),
      db.prepare(sched).bind("e59bc121-decf-46b4-aa51-75c22052b434",tid,9,5,9,"tp-sri","tp-travis","2026-03-10","20:00","Court 3","scheduled",0),
      db.prepare(sched).bind("c0a55756-0a73-40e9-96dc-0fdf9638fa80",tid,10,1,10,"tp-brad","tp-hannes","2026-03-17","18:00","Court 1","scheduled",0),
      db.prepare(sched).bind("30d52ded-86e6-4eaf-a8bc-d667d2fd6c2c",tid,10,2,10,"tp-joe","tp-dan","2026-03-17","18:00","Court 2","scheduled",0),
      db.prepare(sched).bind("375d0f14-e61a-49ab-b3dd-a4c1729ddc1e",tid,10,3,10,"tp-kirk","tp-tristan","2026-03-17","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("5fc339e1-96cf-4f98-bc99-57d070a86905",tid,10,4,10,"tp-matt","tp-travis","2026-03-17","20:00","Court 2","scheduled",0),
      db.prepare(sched).bind("4d19f94a-5ba2-4321-a121-598184019c28",tid,10,5,10,"tp-shimon","tp-sri","2026-03-17","20:00","Court 3","scheduled",0),
      db.prepare(sched).bind("acf305b9-9700-4a75-baeb-1b530d98d39f",tid,11,1,11,"tp-brad","tp-dan","2026-03-24","18:00","Court 1","scheduled",0),
      db.prepare(sched).bind("59933bc9-a2dd-4d28-b66d-8687442de5b0",tid,11,2,11,"tp-joe","tp-tristan","2026-03-24","18:00","Court 2","scheduled",0),
      db.prepare(sched).bind("b5878848-37bf-4f90-9fd3-49271e02f533",tid,11,3,11,"tp-joel","tp-travis","2026-03-24","20:00","Court 1","scheduled",0),
      db.prepare(sched).bind("2e9c6163-d9a0-4444-87c8-3e13311cac2d",tid,11,4,11,"tp-kirk","tp-sri","2026-03-24","20:00","Court 2","scheduled",0),
      db.prepare(sched).bind("dd89aa2d-9f4e-42be-8227-0f2409a75cfb",tid,11,5,11,"tp-matt","tp-shimon","2026-03-24","20:00","Court 3","scheduled",0),
    ]);

    const counts = await db.prepare("SELECT (SELECT count(*) FROM players) as players, (SELECT count(*) FROM tournament_matches) as matches, (SELECT count(*) FROM league_matches) as league_matches, (SELECT count(*) FROM teams) as teams").first();

    return NextResponse.json({ ok: true, seeded: true, counts });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 });
  }
}
