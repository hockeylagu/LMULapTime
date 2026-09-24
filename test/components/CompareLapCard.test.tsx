import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompareLapCard } from '../../src/components/compare-laps/CompareLapCard';
import { ComparableLap } from '../../src/utils/lapComparison';
import { ReferenceLaptimeEntry } from '../../server/core/types';

describe('CompareLapCard', () => {
  const baseLap: ComparableLap = {
    id: 'lap-1',
    lapNum: 5,
    lapTime: 95.432,
    lapTimeString: '1:35.432',
    s1: 28.123,
    s2: 34.567,
    s3: 32.742,
    s1String: '28.123',
    s2String: '34.567',
    s3String: '32.742',
    topSpeed: 285.4,
    fCompound: 'Medium',
    rCompound: 'Medium',
    tireWear: { fl: 94, fr: 93, rl: 96, rr: 95, avg: 94.5 },
    fuel: 45.2,
    fuelUsed: 2.1,
    virtualEnergy: 78.5,
    virtualEnergyUsed: 3.4,
    carType: 'Ferrari 499P',
    carClass: 'Hypercar',
    driverName: 'Antonio Fuoco',
    sessionName: 'Qualifying',
    sessionType: 'Qualifying',
    sessionId: 'session-123',
    isValid: true,
    isPitStop: false,
    isOutLap: false,
    isInferred: false,
    isSessionBest: false,
    isAllTimePB: false,
    pacePercentage: 100.8,
    paceCategory: 'Alien',
  };

  const mockBenchmarks: ReferenceLaptimeEntry[] = [
    {
      key: 'Monza_Hypercar',
      trackName: 'Autodromo Nazionale Monza',
      carClass: 'Hypercar',
      patch: '1.4+',
      target100Sec: 94.5,
      targets: {
        alienSec: 94.5,
        competitiveSec: 95.5,
        goodSec: 96.5,
        goodMidpackSec: 97.0,
        midpackSec: 97.5,
        midpackTailSec: 98.0,
        tailEnderSec: 98.5,
        offlineSec: 100.0,
      },
    },
  ];

  it('renders baseline lap card with correct styling and no baseline button', () => {
    const onSetBaseline = vi.fn();
    const onRemoveLap = vi.fn();

    render(
      <CompareLapCard
        lap={baseLap}
        isBaseline={true}
        deltas={null}
        color="#38bdf8"
        isCardS1Best={true}
        isCardS2Best={false}
        isCardS3Best={false}
        onSetBaseline={onSetBaseline}
        onRemoveLap={onRemoveLap}
        benchmarks={mockBenchmarks}
        allLaps={[baseLap]}
        selectedCarClass="Hypercar"
      />
    );

    expect(screen.getByText('Lap 5')).toBeInTheDocument();
    expect(screen.getByText('Antonio Fuoco')).toBeInTheDocument();
    expect(screen.getByText('Ferrari 499P')).toBeInTheDocument();
    expect(screen.getByText('1:35.432')).toBeInTheDocument();
    expect(screen.getByText('285.4 km/h')).toBeInTheDocument();
    expect(screen.getByText('Wear: 94.5% avg')).toBeInTheDocument();
    expect(screen.getByText(/45.2% \(-2.1%\)/)).toBeInTheDocument();
    expect(screen.getByText(/78.5% \(-3.4%\)/)).toBeInTheDocument();

    // Baseline card should not show 'Set Baseline' button
    expect(screen.queryByText('Set Baseline')).not.toBeInTheDocument();
  });

  it('renders non-baseline lap card with deltas and triggers set baseline and remove', () => {
    const onSetBaseline = vi.fn();
    const onRemoveLap = vi.fn();
    const onSelectSession = vi.fn();

    const mockDeltas = {
      s1Delta: 0.123,
      s1DeltaFormatted: '+0.123',
      s1DeltaClass: 'text-rose-400',
      s2Delta: -0.05,
      s2DeltaFormatted: '-0.050',
      s2DeltaClass: 'text-emerald-400',
      s3Delta: 0.01,
      s3DeltaFormatted: '+0.010',
      s3DeltaClass: 'text-rose-400',
      speedDelta: 2.5,
      speedDeltaFormatted: '+2.5 km/h',
      speedDeltaClass: 'text-emerald-400',
      lapDelta: 0.083,
      lapDeltaFormatted: '+0.083',
      lapDeltaClass: 'text-rose-400',
      lapTimeDelta: 0.083,
      lapTimeDeltaFormatted: '+0.083',
      lapTimeDeltaClass: 'text-rose-400',
      isFasterOverall: false,
    };

    render(
      <CompareLapCard
        lap={{ ...baseLap, isAllTimePB: true, tag: 'PB Lap' }}
        isBaseline={false}
        deltas={mockDeltas}
        color="#a855f7"
        isCardS1Best={false}
        isCardS2Best={true}
        isCardS3Best={true}
        onSetBaseline={onSetBaseline}
        onRemoveLap={onRemoveLap}
        onSelectSession={onSelectSession}
        benchmarks={mockBenchmarks}
        allLaps={[baseLap]}
        selectedCarClass="Hypercar"
      />
    );

    expect(screen.getByText('PB Lap')).toBeInTheDocument();
    expect(screen.getByText('+0.123')).toBeInTheDocument();
    expect(screen.getByText('-0.050')).toBeInTheDocument();
    expect(screen.getByText('+0.010')).toBeInTheDocument();
    expect(screen.getByText('+2.5 km/h')).toBeInTheDocument();

    // Click Set Baseline
    const baselineBtn = screen.getByText('Set Baseline');
    fireEvent.click(baselineBtn);
    expect(onSetBaseline).toHaveBeenCalledWith('lap-1');

    // Click Remove
    const removeBtn = screen.getByTitle('Remove from comparison');
    fireEvent.click(removeBtn);
    expect(onRemoveLap).toHaveBeenCalled();

    // Click View Full Session
    const viewSessionBtn = screen.getByText('View Full Session →');
    fireEvent.click(viewSessionBtn);
    expect(onSelectSession).toHaveBeenCalledWith('session-123');
  });

  it('computes pace from matching benchmarks when paceCategory is missing', () => {
    const unratedLap: ComparableLap = {
      ...baseLap,
      paceCategory: undefined,
      pacePercentage: undefined,
    };

    render(
      <CompareLapCard
        lap={unratedLap}
        isBaseline={false}
        deltas={null}
        color="#38bdf8"
        isCardS1Best={false}
        isCardS2Best={false}
        isCardS3Best={false}
        onSetBaseline={vi.fn()}
        onRemoveLap={vi.fn()}
        benchmarks={mockBenchmarks}
        allLaps={[unratedLap]}
        selectedCarClass="Hypercar"
      />
    );

    // 95.432 / 94.5 * 100 = 100.986% -> formatted as 101.0%
    expect(screen.getByText(/101\.0%/)).toBeInTheDocument();
  });

  it('computes pace from sample lap when benchmarks are empty', () => {
    const sampleLap: ComparableLap = {
      ...baseLap,
      lapTime: 95.0,
      pacePercentage: 100.0,
    };

    const unratedLap: ComparableLap = {
      ...baseLap,
      lapTime: 96.9,
      paceCategory: undefined,
      pacePercentage: undefined,
    };

    render(
      <CompareLapCard
        lap={unratedLap}
        isBaseline={false}
        deltas={null}
        color="#38bdf8"
        isCardS1Best={false}
        isCardS2Best={false}
        isCardS3Best={false}
        onSetBaseline={vi.fn()}
        onRemoveLap={vi.fn()}
        benchmarks={[]}
        allLaps={[sampleLap, unratedLap]}
        selectedCarClass="Hypercar"
      />
    );

    // 96.9 / 95.0 * 100 = 102.0%
    expect(screen.getByText(/102\.0%/)).toBeInTheDocument();
  });

  it('renders status badges fallback when tireWear is missing', () => {
    const pitLap: ComparableLap = {
      ...baseLap,
      isSessionBest: true,
      topSpeed: 0,
      tireWear: undefined,
      isPitStop: true,
      pitStopDurationString: '24.5s',
    };

    render(
      <CompareLapCard
        lap={pitLap}
        isBaseline={false}
        deltas={null}
        color="#38bdf8"
        isCardS1Best={false}
        isCardS2Best={false}
        isCardS3Best={false}
        onSetBaseline={vi.fn()}
        onRemoveLap={vi.fn()}
        benchmarks={mockBenchmarks}
        allLaps={[pitLap]}
        selectedCarClass="Hypercar"
      />
    );

    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.getByText('PIT STOP')).toBeInTheDocument();
  });
});
