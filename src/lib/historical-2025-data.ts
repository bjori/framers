export interface HistoricalLine {
  type: "singles" | "doubles";
  position: number;
  homePlayers: (string | null)[];
  visitorPlayers: (string | null)[];
  score: string;
  winner: "home" | "visitor";
  isDefault?: boolean;
  winReversed?: boolean;
}

export interface HistoricalMatch {
  date: string;
  teamId: string;
  opponent: string;
  homeTeam: "us" | "them";
  ourScore: number;
  theirScore: number;
  lines: HistoricalLine[];
}

const P = {
  hannes: "8dbc87ab-f415-40ee-9fed-e7857445f998",
  dan: "5c591f7a-9f54-4e86-a507-787d2770f028",
  joel: "ad74e6ea-ffcc-419f-8c15-3dcdf366d490",
  matt: "5a61d2ac-cd7c-4f10-8716-f3fc6f3351fa",
  shimon: "e200b62b-e557-47ba-98e8-1dca23d23e0e",
  bhaven: "a1b2c3d4-1111-4000-8000-000000000005",
  travis: "269a7039-5e49-47b3-a621-d4c40f3f40b5",
  kelly: "a1b2c3d4-1111-4000-8000-000000000003",
  jeff_t: "a1b2c3d4-1111-4000-8000-000000000006",
  aaron: "a1b2c3d4-2222-4000-8000-000000000004",
  sri: "bbbf95a3-2773-4035-8b20-99354ab33a0d",
  brad: "624ef626-b13a-47c9-b23b-6fa96c237f47",
  juan: "a1b2c3d4-1111-4000-8000-000000000001",
  guy: "a1b2c3d4-1111-4000-8000-000000000002",
  tom: "a1b2c3d4-2222-4000-8000-000000000005",
  jeff_m: "a1b2c3d4-1111-4000-8000-000000000004",
  joe: "92e1a868-573c-487e-93c6-3f84488a222c",
  sandeep: "a1b2c3d4-2222-4000-8000-000000000001",
  tim: "a1b2c3d4-2222-4000-8000-000000000002",
  kirill: "a1b2c3d4-2222-4000-8000-000000000003",
  tristan: "eb9d8bcb-ad69-43fc-87c2-d7024060185a",
  kirk: "acd5a9ec-d224-466a-a6d1-7b9b28aa961b",
} as const;

const TF = "team-the-framers-2025";
const YF = "team-youth-framers-2025";

export const HISTORICAL_2025_MATCHES: HistoricalMatch[] = [
  // ===== THE FRAMERS 2025 (40+ 3.0) =====
  {
    date: "2025-01-11", teamId: TF, opponent: "Crow Canyon CC", homeTeam: "them", ourScore: 2, theirScore: 3,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.joel], score: "6-2,6-2", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.juan, P.guy], score: "6-3,6-3", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.kelly, P.jeff_t], score: "6-1,7-5", winner: "visitor" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.dan, P.matt], score: "6-1,6-1", winner: "home" },
    ],
  },
  {
    date: "2025-01-19", teamId: TF, opponent: "Blackhawk CC", homeTeam: "us", ourScore: 2, theirScore: 3,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.hannes], visitorPlayers: [null], score: "6-4,7-6", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [P.tom, P.joel], visitorPlayers: [null, null], score: "6-2,6-2", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.shimon, P.bhaven], visitorPlayers: [null, null], score: "6-4,2-6,1-0", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [P.dan, P.matt], visitorPlayers: [null, null], score: "6-3,6-2", winner: "visitor" },
    ],
  },
  {
    date: "2025-01-27", teamId: TF, opponent: "Bay Trees PK Bandits", homeTeam: "us", ourScore: 4, theirScore: 1,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.matt], visitorPlayers: [null], score: "6-1,6-3", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [P.hannes, P.kelly], visitorPlayers: [null, null], score: "6-1,7-5", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [P.jeff_t, P.aaron], visitorPlayers: [null, null], score: "3-6,6-4,1-0", winner: "visitor" },
      { type: "doubles", position: 3, homePlayers: [P.joel, P.dan], visitorPlayers: [null, null], score: "6-0,6-7,1-0", winner: "home" },
    ],
  },
  {
    date: "2025-02-09", teamId: TF, opponent: "Castlewood CC", homeTeam: "them", ourScore: 1, theirScore: 4,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.matt], score: "6-3,7-6", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.travis, P.bhaven], score: "6-4,5-7,1-0", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.kelly, P.aaron], score: "6-1,6-1", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.shimon, P.jeff_t], score: "6-3,6-0", winner: "visitor" },
    ],
  },
  {
    date: "2025-02-21", teamId: TF, opponent: "Fremont TC Thunderbolts", homeTeam: "us", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.joel], visitorPlayers: [null], score: "4-6,6-2,1-0", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.hannes, P.bhaven], visitorPlayers: [null, null], score: "6-3,6-2", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.kelly, P.aaron], visitorPlayers: [null, null], score: "6-3,6-2", winner: "visitor" },
      { type: "doubles", position: 3, homePlayers: [P.travis, P.dan], visitorPlayers: [null, null], score: "6-3,6-3", winner: "visitor" },
    ],
  },
  {
    date: "2025-02-23", teamId: TF, opponent: "Pleasanton GRTC", homeTeam: "them", ourScore: 1, theirScore: 4,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.shimon], score: "6-3,6-3", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.travis, P.bhaven], score: "6-1,6-1", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.juan, P.aaron], score: "6-1,6-1", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.hannes, P.sri], score: "6-4,7-6", winner: "home" },
    ],
  },
  {
    date: "2025-02-24", teamId: TF, opponent: "Pleasanton DPTG", homeTeam: "us", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.shimon], visitorPlayers: [null], score: "6-2,6-2", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.kelly, P.travis], visitorPlayers: [null, null], score: "6-1,6-1", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.aaron, P.juan], visitorPlayers: [null, null], score: "6-2,6-0", winner: "visitor" },
      { type: "doubles", position: 3, homePlayers: [P.dan, P.jeff_t], visitorPlayers: [null, null], score: "6-1,6-4", winner: "visitor" },
    ],
  },
  {
    date: "2025-03-08", teamId: TF, opponent: "Pleasanton DPTG-Doubletons", homeTeam: "them", ourScore: 1, theirScore: 4,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.matt], score: "6-2,7-5", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.shimon, P.bhaven], score: "6-0,6-3", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.aaron, P.hannes], score: "6-0,6-1", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.juan, P.sri], score: "2-6,6-4,1-0", winner: "visitor" },
    ],
  },
  {
    date: "2025-03-10", teamId: TF, opponent: "Dougherty Valley HS", homeTeam: "them", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.shimon], score: "6-1,6-1", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.hannes, P.joel], score: "0-6,6-3,1-0", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.kelly, P.bhaven], score: "6-3,6-4", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.tom, P.sri], score: "6-2,6-3", winner: "home" },
    ],
  },
  {
    date: "2025-03-15", teamId: TF, opponent: "Crow Canyon CC", homeTeam: "us", ourScore: 1, theirScore: 4,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.brad], score: "6-0,6-0", winner: "visitor", isDefault: true },
      { type: "doubles", position: 1, homePlayers: [P.hannes, P.aaron], visitorPlayers: [null, null], score: "6-3,6-4", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.kelly, P.bhaven], visitorPlayers: [null, null], score: "6-2,3-6,1-0", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [null, null], score: "6-0,6-0", winner: "visitor", isDefault: true },
    ],
  },

  // ===== YOUTH FRAMERS 2025 (18+ 3.0) =====
  {
    date: "2025-04-12", teamId: YF, opponent: "Dougherty Valley HS", homeTeam: "us", ourScore: 2, theirScore: 3,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.matt], visitorPlayers: [null], score: "6-2,6-3", winner: "home" },
      { type: "singles", position: 2, homePlayers: [P.kirill], visitorPlayers: [null], score: "7-5,6-3", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.kelly, P.tristan], visitorPlayers: [null, null], score: "6-2,6-1", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.jeff_t, P.travis], visitorPlayers: [null, null], score: "7-5,6-3", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [P.brad, P.tim], visitorPlayers: [null, null], score: "6-2,6-1", winner: "visitor" },
    ],
  },
  {
    date: "2025-04-20", teamId: YF, opponent: "Pleasanton", homeTeam: "them", ourScore: 2, theirScore: 3,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.hannes], score: "6-2,7-5", winner: "home" },
      { type: "singles", position: 2, homePlayers: [null], visitorPlayers: [P.tristan], score: "6-4,6-1", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.juan, P.kirill], score: "1-6,6-2,1-0", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.jeff_t, P.joe], score: "6-4,6-2", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.jeff_m, P.sri], score: "7-6,6-4", winner: "visitor" },
    ],
  },
  {
    date: "2025-05-01", teamId: YF, opponent: "Fremont TC", homeTeam: "them", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.matt], score: "6-2,6-1", winner: "home" },
      { type: "singles", position: 2, homePlayers: [null], visitorPlayers: [P.shimon], score: "7-6,4-6,1-0", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.juan, P.travis], score: "6-1,6-2", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.kelly, P.jeff_m], score: "6-3,7-5", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.tim, P.joe], score: "6-3,6-2", winner: "home" },
    ],
  },
  {
    date: "2025-05-09", teamId: YF, opponent: "Dublin HS Racket Rookies", homeTeam: "us", ourScore: 2, theirScore: 3,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.joel], visitorPlayers: [null], score: "6-3,6-3", winner: "home" },
      { type: "singles", position: 2, homePlayers: [P.shimon], visitorPlayers: [null], score: "6-3,5-7,1-0", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.hannes, P.brad], visitorPlayers: [null, null], score: "7-6,6-4", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.jeff_m, P.jeff_t], visitorPlayers: [null, null], score: "6-1,6-2", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [P.sri, P.sandeep], visitorPlayers: [null, null], score: "6-1,6-2", winner: "visitor" },
    ],
  },
  {
    date: "2025-05-17", teamId: YF, opponent: "Pleasanton DPTG-Doubletons", homeTeam: "them", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.kirill], score: "7-5,6-3", winner: "home" },
      { type: "singles", position: 2, homePlayers: [null], visitorPlayers: [P.brad], score: "6-4,7-5", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.hannes, P.kelly], score: "6-0,6-2", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.shimon, P.jeff_m], score: "6-3,6-2", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.matt, P.tristan], score: "6-2,6-3", winner: "home" },
    ],
  },
  {
    date: "2025-05-21", teamId: YF, opponent: "Pleasanton DPTG", homeTeam: "us", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.hannes], visitorPlayers: [null], score: "6-0,6-0", winner: "home", winReversed: true },
      { type: "singles", position: 2, homePlayers: [P.tristan], visitorPlayers: [null], score: "6-0,6-1", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.travis, P.juan], visitorPlayers: [null, null], score: "6-2,6-2", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.sri, P.shimon], visitorPlayers: [null, null], score: "6-1,6-0", winner: "visitor" },
      { type: "doubles", position: 3, homePlayers: [P.joe, P.sandeep], visitorPlayers: [null, null], score: "6-2,6-1", winner: "visitor" },
    ],
  },
  {
    date: "2025-05-23", teamId: YF, opponent: "Blackhawk CC", homeTeam: "us", ourScore: 2, theirScore: 3,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.matt], visitorPlayers: [null], score: "6-4,2-6,1-0", winner: "home" },
      { type: "singles", position: 2, homePlayers: [P.shimon], visitorPlayers: [null], score: "6-0,6-1", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.hannes, P.brad], visitorPlayers: [null, null], score: "3-6,6-0,1-0", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.jeff_t, P.joe], visitorPlayers: [null, null], score: "6-2,1-6,1-0", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [P.sri, P.tim], visitorPlayers: [null, null], score: "6-0,6-3", winner: "visitor" },
    ],
  },
  {
    date: "2025-05-31", teamId: YF, opponent: "Dougherty Valley HS", homeTeam: "them", ourScore: 1, theirScore: 4,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.hannes], score: "6-4,6-3", winner: "visitor" },
      { type: "singles", position: 2, homePlayers: [null], visitorPlayers: [P.brad], score: "6-2,6-3", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.kelly, P.jeff_t], score: "6-2,4-6,1-0", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.matt, P.joe], score: "6-0,6-3", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.sri, P.tristan], score: "6-4,6-3", winner: "home" },
    ],
  },
  {
    date: "2025-06-06", teamId: YF, opponent: "Pleasanton", homeTeam: "us", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [P.kirill], visitorPlayers: [null], score: "6-3,6-4", winner: "visitor" },
      { type: "singles", position: 2, homePlayers: [P.sri], visitorPlayers: [null], score: "6-1,6-1", winner: "visitor" },
      { type: "doubles", position: 1, homePlayers: [P.juan, P.shimon], visitorPlayers: [null, null], score: "6-2,2-6,1-0", winner: "visitor" },
      { type: "doubles", position: 2, homePlayers: [P.tristan, P.jeff_m], visitorPlayers: [null, null], score: "6-4,7-6", winner: "visitor" },
      { type: "doubles", position: 3, homePlayers: [P.matt, P.sandeep], visitorPlayers: [null, null], score: "6-2,6-3", winner: "visitor" },
    ],
  },
  {
    date: "2025-06-09", teamId: YF, opponent: "Pleasanton DPTG", homeTeam: "them", ourScore: 0, theirScore: 5,
    lines: [
      { type: "singles", position: 1, homePlayers: [null], visitorPlayers: [P.joel], score: "6-1,6-3", winner: "home" },
      { type: "singles", position: 2, homePlayers: [null], visitorPlayers: [P.sri], score: "6-0,6-2", winner: "home" },
      { type: "doubles", position: 1, homePlayers: [null, null], visitorPlayers: [P.hannes, P.juan], score: "6-1,7-6", winner: "home" },
      { type: "doubles", position: 2, homePlayers: [null, null], visitorPlayers: [P.kelly, P.jeff_m], score: "6-3,6-3", winner: "home" },
      { type: "doubles", position: 3, homePlayers: [null, null], visitorPlayers: [P.shimon, P.bhaven], score: "6-3,6-1", winner: "home" },
    ],
  },
];
