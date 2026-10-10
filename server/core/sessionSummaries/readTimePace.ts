import type { SessionCard } from '../../../shared/types/sessionSummaries.js';
import type { DetailedSession } from '../types.js';
import { calculatePaceCategory } from '../../benchmarks/referenceLaptimes.js';
import { rateDriversPace } from '../../sessions/sessionPaceRating.js';

/** Benchmark-dependent values belong to the requested DTO, never a history-wide JSON rewrite. */
export function rateSessionCard(card: SessionCard): SessionCard {
  const player = card.playerDriver;
  if (!player) return card;
  const pace = player.bestLapWet ? null : calculatePaceCategory(player.bestLapTime, card.trackVenue,
    card.trackCourse, player.carClass, player.carType, card.trackLengthMeters);
  player.bestLapPaceCategory = pace?.category;
  player.bestLapPacePercentage = pace?.percentage;
  return card;
}

export function rateSessionDetail(session: DetailedSession): DetailedSession {
  rateDriversPace(session.drivers, {venue:session.trackVenue,course:session.trackCourse,trackLengthMeters:session.trackLengthMeters});
  for (const driver of session.drivers) {
    if (driver.bestLapWet) { delete driver.bestLapPaceCategory; delete driver.bestLapPacePercentage; }
  }
  if (session.playerDriver) {
    const player=session.drivers.find(driver=>driver.isPlayer) ?? session.drivers.find(driver=>driver.name===session.playerDriver?.name);
    if(player)session.playerDriver=player;
  }
  return session;
}
