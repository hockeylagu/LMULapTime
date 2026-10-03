import React, { useMemo } from 'react';
import type { TrackSurfaceProfile } from '../../../shared/types/trackGeometry.js';
import { LMU_COLORS, TELEMETRY_COLORS } from '../../utils/themeColors.js';

interface TrackSurfaceProfilesProps {
  profile?: TrackSurfaceProfile;
  lengthM: number;
}

interface ProfileSeries {
  label: string;
  unit: string;
  values: Array<number | null>;
  color: string;
}

function buildProfilePaths(stations: number[], values: Array<number | null>, lengthM: number): string[] {
  const valid = values.map((value, index) => ({ value, index }))
    .filter((sample): sample is { value: number; index: number } => typeof sample.value === 'number' && Number.isFinite(sample.value));
  if (!valid.length || stations.length !== values.length || !Number.isFinite(lengthM) || lengthM <= 0) return [];

  const min = Math.min(...valid.map(sample => sample.value));
  const max = Math.max(...valid.map(sample => sample.value));
  const span = max - min || 1;
  const paths: string[] = [];
  let commands: string[] = [];
  let previousIndex = -2;

  for (const sample of valid) {
    if (sample.index !== previousIndex + 1 && commands.length) {
      paths.push(commands.join(' '));
      commands = [];
    }
    const x = Math.max(0, Math.min(300, stations[sample.index] / lengthM * 300));
    const y = 30 - ((sample.value - min) / span) * 24;
    commands.push(`${commands.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
    previousIndex = sample.index;
  }
  if (commands.length) paths.push(commands.join(' '));
  return paths;
}

function formatExtent(values: Array<number | null>, unit: string): string {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!finite.length) return 'Unavailable';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return min === max ? `${min.toFixed(1)} ${unit}` : `${min.toFixed(1)} to ${max.toFixed(1)} ${unit}`;
}

export const TrackSurfaceProfiles: React.FC<TrackSurfaceProfilesProps> = React.memo(({ profile, lengthM }) => {
  const series = useMemo<ProfileSeries[]>(() => profile ? [
    { label: 'Elevation · local Y', unit: 'm', values: profile.elevationM, color: TELEMETRY_COLORS.primary },
    { label: 'Grade', unit: '%', values: profile.gradePct, color: TELEMETRY_COLORS.gain },
    { label: 'Bank', unit: '°', values: profile.bankDeg, color: LMU_COLORS.gold },
  ] : [], [profile]);

  if (!profile || !profile.stationM.length) return null;

  return (
    <section aria-label="Native road elevation and slope profiles" className="rounded-lg border border-lmu-border bg-lmu-raised/40 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-lmu-text">Road profile <span className="font-normal text-lmu-muted">· local coordinates</span></h4>
      {series.map(item => {
        const paths = buildProfilePaths(profile.stationM, item.values, lengthM);
        return (
          <div key={item.label} className="grid grid-cols-[7rem_minmax(0,1fr)_7rem] items-center gap-2" data-profile-row={item.label}>
            <span className="text-[11px] text-lmu-text-soft">{item.label}</span>
            {paths.length ? (
              <svg viewBox="0 0 300 36" role="img" aria-label={`${item.label} profile, ${item.unit}`} className="w-full h-8 overflow-visible">
                <path d="M0 30 H300" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
                {paths.map((d, index) => <path key={index} d={d} fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
              </svg>
            ) : <span className="text-[11px] text-lmu-muted">No measured samples</span>}
            <span className="text-right text-[10px] font-mono text-lmu-muted">{formatExtent(item.values, item.unit)}</span>
          </div>
        );
      })}
      <div className="flex justify-between pl-[7.5rem] pr-[7.5rem] text-[9px] font-mono text-lmu-faint">
        <span>Start / finish</span><span>Station {Math.round(lengthM).toLocaleString()} m</span>
      </div>
    </section>
  );
});
