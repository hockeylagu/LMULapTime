/** A player's laps: the completed laps of a session card, the declared laps of a detailed session's driver. */
export function driverLapsCount(driver: { lapsCount: number } | { declaredLapsCount: number }): number {
  return 'lapsCount' in driver ? driver.lapsCount : driver.declaredLapsCount;
}

export function isSessionEmpty(session: {
  playerDriver?: ({ lapsCount: number } | { declaredLapsCount: number }) & { bestLapTime?: number | null };
  driversCount?: number;
}): boolean {
  if (!session.playerDriver) return (session.driversCount ?? 0) === 0;
  return driverLapsCount(session.playerDriver) === 0 || session.playerDriver.bestLapTime === null;
}
