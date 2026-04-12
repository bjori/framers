/** NorCal league home matches for Greenbrook-hosted teams play here unless overridden on the match. */
export const GREENBROOK_HOME_VENUE = "Greenbrook Tennis Courts";

export function displayLeagueMatchLocation(
  location: string | null | undefined,
  isHome: number | boolean,
): string {
  const trimmed = location?.trim();
  if (trimmed) return trimmed;
  if (isHome === 1 || isHome === true) return GREENBROOK_HOME_VENUE;
  return "TBD";
}
