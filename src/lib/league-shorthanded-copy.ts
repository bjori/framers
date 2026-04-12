/** Rotating persuasive copy (no API) for players who RSVP’d out while the card still has holes. */
export function personalShorthandedPlea(
  matchId: string,
  opponentTeam: string,
  vacantLinesLabel: string,
): string {
  const opp = opponentTeam || "this opponent";
  const lines = vacantLinesLabel;
  const variants = [
    `We’re lined up to give away ${lines} vs ${opp} unless we fill the card. Even if you tapped “No,” if there’s any chance you can make it, flipping to Yes is huge — defaults are brutal on standings and morale.`,
    `${lines} is still open for ${opp}. The team would rather have you on a court you’re not 100% sure about than take a default. If your schedule loosened even a little, please update your RSVP — captains can always adjust the lineup.`,
    `Right now we’re risking a default on ${lines} against ${opp}. You said you can’t make it, which we get — life happens — but if there’s any way to squeeze this in, we’d owe you one. One more “Yes” might be the difference between competing and forfeiting.`,
  ];
  const idx = [...matchId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % variants.length;
  return variants[idx];
}
