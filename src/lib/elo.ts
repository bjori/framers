const BASE_K = 32;
const MIN_K = 16;
const MATCHES_FOR_MIN_K = 20;

function kFactor(matchesPlayed: number): number {
  if (matchesPlayed >= MATCHES_FOR_MIN_K) return MIN_K;
  return BASE_K - (BASE_K - MIN_K) * (matchesPlayed / MATCHES_FOR_MIN_K);
}

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface EloResult {
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  deltaB: number;
}

export function calculateElo(
  ratingA: number,
  ratingB: number,
  aWon: boolean,
  matchesPlayedA: number,
  matchesPlayedB: number,
  margin?: { setsWonByWinner: number; setsWonByLoser: number }
): EloResult {
  const eA = expectedScore(ratingA, ratingB);
  const eB = 1 - eA;

  let actualA = aWon ? 1 : 0;
  let actualB = aWon ? 0 : 1;

  // Margin of victory bonus (up to 0.1 extra)
  if (margin) {
    const totalSets = margin.setsWonByWinner + margin.setsWonByLoser;
    if (totalSets > 0) {
      const dominance = (margin.setsWonByWinner - margin.setsWonByLoser) / totalSets;
      const bonus = dominance * 0.1;
      if (aWon) {
        actualA += bonus;
        actualB -= bonus;
      } else {
        actualB += bonus;
        actualA -= bonus;
      }
    }
  }

  const kA = kFactor(matchesPlayedA);
  const kB = kFactor(matchesPlayedB);

  const deltaA = Math.round(kA * (actualA - eA));
  const deltaB = Math.round(kB * (actualB - eB));

  return {
    newRatingA: ratingA + deltaA,
    newRatingB: ratingB + deltaB,
    deltaA,
    deltaB,
  };
}

export function seedElo(ntrpRating: number): number {
  const eloMap: Record<string, number> = {
    "2.0": 1200,
    "2.5": 1350,
    "3.0": 1500,
    "3.5": 1650,
    "4.0": 1800,
    "4.5": 1950,
    "5.0": 2100,
  };
  return eloMap[ntrpRating.toString()] ?? 1500;
}
