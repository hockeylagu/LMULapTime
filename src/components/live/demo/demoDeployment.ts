import type { LiveDeployment } from '../../../../shared/types/liveStrategy.js';
import { DeploymentGuidance } from '../../../../shared/domain/live/energy/deploymentGuidance.js';
import { deploymentAdvice } from '../../../../shared/domain/live/energy/deploymentTracker.js';

/**
 * Laps shaped on the 2026-10-27 Spa practice (Peugeot 9x8): map 2 of 0..10 (40 kW, the plugin's 0–200 kW list) charging
 * a few points a lap under a large in-lap swing.
 */
const KW = Array.from({ length: 11 }, (_, map) => map * 20);
const CURRENT = 40;
const LAP_SECONDS = 120;
const LAP_METERS = 7004;
const charge = (seconds: number) => 50 + 6 * (seconds / LAP_SECONDS) + 15 * Math.sin((2 * Math.PI * seconds) / LAP_SECONDS);

/**
 * Every Hypercar demo scenario on track shows this advice, run through the real controller at 5 Hz: two laps hold with
 * the coming change counted down; `change` drives on until the lap average is a lap from full and the step up is advised.
 */
export function demoDeployment(change = false): LiveDeployment | null {
  const guidance = new DeploymentGuidance(KW);
  const end = LAP_SECONDS * (change ? 4.75 : 2);
  for (let time = 0; time <= end; time += 0.2) {
    guidance.observe({ time, distance: (time / LAP_SECONDS) * LAP_METERS, lapLength: LAP_METERS, charge: charge(time), current: CURRENT });
  }
  return deploymentAdvice(guidance, 'kW', CURRENT, charge(end));
}
