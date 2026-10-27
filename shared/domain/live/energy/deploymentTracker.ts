import type { LiveDeployment } from '../../../types/liveStrategy.js';
import type { LiveHybridReading } from '../liveCarCondition.js';
import { DeploymentGuidance } from './deploymentGuidance.js';

/**
 * Battery charge in percent from the raw hybrid fields: `batteryChargeFraction` when it is finite and in (0, 1]; otherwise
 * `soc` (taken as a fraction when it is at most 1, else as percent). Both carry the same charge in LMU (Spa practice
 * 2026-10-27, Peugeot 9x8). A zero reads as unavailable, so a fully empty battery shows no charge.
 */
export function hybridChargePercent(hybrid: LiveHybridReading): number | null {
  const { batteryChargeFraction: fraction, soc } = hybrid;
  if (Number.isFinite(fraction) && fraction > 0 && fraction <= 1) return fraction * 100;
  if (Number.isFinite(soc) && soc > 0 && soc <= 100) return soc <= 1 ? soc * 100 : soc;
  return null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * The snapshot's advice from the guidance state and the live reading (`live` setting, `charge` percent). The driver may
 * already have moved the setting since the last sample: the target then holds only if it was followed, and the next
 * setting only while the setting is still the one the guidance saw.
 */
export function deploymentAdvice(guidance: DeploymentGuidance, unit: 'kW' | 'map', live: number | null, charge: number | null): LiveDeployment {
  const advice = guidance.advice;
  const followed = live === null || advice.current === null || live === advice.current;
  const change = guidance.changePerLap;
  const seconds = guidance.edgeSeconds;
  const countdown = followed ? guidance.changeSeconds : null;
  return {
    unit, current: live ?? advice.current,
    target: live === null || followed || live === advice.target ? advice.target : null,
    next: followed ? guidance.next : null, changeSeconds: countdown === null ? null : Math.round(countdown),
    settlingLaps: advice.settlingLaps, chargePercent: charge === null ? null : round1(charge),
    changePerLap: change === null ? null : round1(change),
    edge: guidance.edge, edgeSeconds: seconds === null ? null : Math.round(seconds),
  };
}

/**
 * Feeds `DeploymentGuidance` a sample per scoring reading and builds the snapshot's `deployment`. The settings are the
 * car's plugin kW list (index = the game's motor map, an assumption to validate) when its length is `motorMapMax + 1`,
 * else the map positions themselves. Only the pit lane breaks the measurement: yellow and safety car laps and invalid
 * laps still count, the battery works the same. Deterministic and clock-free (session clock only).
 */
export class DeploymentTracker {
  private pluginKw: readonly number[] | null = null;
  private hybrid: LiveHybridReading | null = null;
  private guidance: DeploymentGuidance | null = null;
  private key = '';

  /** The car's plugin deployment list in kW, null without one. */
  public setPluginKw(kw: readonly number[] | null): void { this.pluginKw = kw; }

  public applyCar(hybrid: LiveHybridReading | undefined): void {
    this.hybrid = hybrid ?? null;
    const settings = this.settings();
    const key = settings ? `${settings.unit}|${settings.values.join(',')}` : '';
    if (key !== this.key) {
      this.key = key;
      this.guidance = settings ? new DeploymentGuidance(settings.values) : null;
    }
  }

  /** One scoring reading: session clock, distance driven and lap length (meters), with the latest car reading. */
  public sample(time: number, distance: number, lapLength: number, inPits: boolean): void {
    const hybrid = this.hybrid;
    const settings = this.settings();
    if (!hybrid || !settings || !this.guidance) return;
    if (inPits) { this.guidance.reset(); return; }
    const charge = hybridChargePercent(hybrid);
    const current = settings.values[hybrid.motorMap];
    // A missing charge or an unknown setting breaks the measurement like the pit lane does.
    this.guidance.observe({ time, distance, lapLength, charge: charge ?? Number.NaN, current: current ?? Number.NaN });
  }

  public reset(): void {
    this.hybrid = null; this.guidance = null; this.key = '';
  }

  public deployment(active: boolean): LiveDeployment | null {
    const hybrid = this.hybrid;
    const settings = this.settings();
    // No battery charge means no hybrid system (a Hypercar without one still reports motor map fields): no section at all.
    const charge = hybrid ? hybridChargePercent(hybrid) : null;
    if (!active || !hybrid || charge === null || !settings || !this.guidance) return null;
    return deploymentAdvice(this.guidance, settings.unit, settings.values[hybrid.motorMap] ?? null, charge);
  }

  private settings(): { unit: 'kW' | 'map'; values: number[] } | null {
    const max = this.hybrid?.motorMapMax ?? 0;
    if (!this.hybrid || !Number.isInteger(max) || max <= 0) return null;
    if (this.pluginKw && this.pluginKw.length === max + 1) return { unit: 'kW', values: [...this.pluginKw] };
    return { unit: 'map', values: Array.from({ length: max + 1 }, (_, map) => map) };
  }
}
