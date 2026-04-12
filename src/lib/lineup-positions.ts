/** USTA-style starter labels in display order: S1… then D1A,D1B, D2A,D2B, … */
export function expectedStarterPositions(format: { singles: number; doubles: number }): string[] {
  const positions: string[] = [];
  for (let i = 1; i <= format.singles; i++) positions.push(`S${i}`);
  for (let d = 1; d <= format.doubles; d++) {
    positions.push(`D${d}A`, `D${d}B`);
  }
  return positions;
}

export function vacantStarterPositionsFromPayload(
  slots: { position: string; playerId: string | null }[],
  format: { singles: number; doubles: number },
): { position: string }[] {
  const byPos = new Map(slots.map((s) => [s.position, s.playerId]));
  const vacant: { position: string }[] = [];
  for (const pos of expectedStarterPositions(format)) {
    const id = byPos.get(pos);
    if (id == null || id === "") vacant.push({ position: pos });
  }
  return vacant;
}
