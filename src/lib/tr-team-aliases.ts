/**
 * TennisRecord uses USTA-style team names on teamprofile.aspx; our app uses friendly names.
 */

const DISPLAY_TO_TR: Record<string, string> = {
  "Senior Framers 2026": "GREENBROOK RS 40AM3.0A",
  "Junior Framers 2026": "GREENBROOK RS 18AM3.0A",
};

const SLUG_TO_TR: Record<string, string> = {
  "senior-framers-2026": "GREENBROOK RS 40AM3.0A",
  "junior-framers-2026": "GREENBROOK RS 18AM3.0A",
  "senior-framers-2025": "GREENBROOK RS 40AM3.0A",
  "junior-framers-2025": "GREENBROOK RS 18AM3.0A",
};

/** TR `team_name` values for our active teams (admin scouting table + cache keys). */
export const OUR_TENNISRECORD_TEAM_NAMES: readonly string[] = [
  ...new Set(Object.values(DISPLAY_TO_TR)),
];

/** Resolve Framers team display name (from DB) to the TennisRecord team_name string. */
export function tennisRecordTeamNameFromDisplayName(displayName: string): string {
  return DISPLAY_TO_TR[displayName] ?? displayName;
}

/** Resolve team slug (URL) to TennisRecord name for our teams; unknown slugs return null. */
export function tennisRecordTeamNameFromSlug(slug: string): string | null {
  const key = slug.trim().toLowerCase();
  return SLUG_TO_TR[key] ?? null;
}
