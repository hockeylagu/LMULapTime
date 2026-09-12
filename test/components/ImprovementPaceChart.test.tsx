import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImprovementPaceChart, ImprovementChartPoint } from '../../src/components/track-detail/improvement-chart/index.js';

describe('ImprovementPaceChart legend toggle', () => {
  const samplePoints: ImprovementChartPoint[] = [
    {
      chartKey: 'sess-1-1',
      shortSession: 'May 28',
      fullDate: '2026/05/28 14:00',
      sessionId: 'sess-1',
      session: 'Practice 1',
      car: 'Ferrari 499P',
      bestLap: 122.0,
      top3Avg: 123.0,
      top3AvgStr: '2:03.000',
      movingAvg: 122.5,
      avgLap: 124.0,
      theoretical: 121.5,
      theoreticalGap: 0.5,
      consistencyScore: 94.5,
      s1: 35.0,
      s2: 42.0,
      s3: 45.0,
      lapStr: '2:02.000',
      theoreticalStr: '2:01.500',
      avgLapStr: '2:04.000',
      cleanLaps: 5,
    },
    {
      chartKey: 'sess-2-2',
      shortSession: 'May 29',
      fullDate: '2026/05/29 16:00',
      sessionId: 'sess-2',
      session: 'Qualifying 1',
      car: 'Ferrari 499P',
      bestLap: 121.0,
      top3Avg: 122.0,
      top3AvgStr: '2:02.000',
      movingAvg: 121.5,
      avgLap: 123.0,
      theoretical: 120.8,
      theoreticalGap: 0.2,
      consistencyScore: 96.0,
      s1: 34.8,
      s2: 41.5,
      s3: 44.7,
      lapStr: '2:01.000',
      theoreticalStr: '2:00.800',
      avgLapStr: '2:03.000',
      cleanLaps: 6,
    },
  ];

  it('renders interactive clickable legend items in bestLap metric and toggles visibility on click', () => {
    render(
      <ImprovementPaceChart
        chartData={samplePoints}
        metric="bestLap"
        minTime={120}
        maxTime={125}
        activeTrack="Spa"
        selectedCarClass="Hypercar"
        selectedCarModel="All"
        filterType="All"
        activeRange="all"
        onSelectSession={vi.fn()}
      />
    );

    // Legend items should exist with clickable titles
    const bestLapLegendItem = screen.getByTitle('Click to toggle Best Lap Time visibility');
    expect(bestLapLegendItem).toBeInTheDocument();
    expect(bestLapLegendItem.className).toContain('opacity-100 font-semibold');
    expect(bestLapLegendItem.className).not.toContain('line-through');

    // Click to toggle off / hide
    fireEvent.click(bestLapLegendItem);
    expect(bestLapLegendItem.className).toContain('line-through');
    expect(bestLapLegendItem.className).toContain('opacity-35');

    // Click again to toggle back on / show
    fireEvent.click(bestLapLegendItem);
    expect(bestLapLegendItem.className).toContain('opacity-100 font-semibold');
    expect(bestLapLegendItem.className).not.toContain('line-through');
  });

  it('allows toggling multiple series independently in sectors metric', () => {
    render(
      <ImprovementPaceChart
        chartData={samplePoints}
        metric="sectors"
        minTime={30}
        maxTime={50}
        activeTrack="Spa"
        selectedCarClass="Hypercar"
        selectedCarModel="All"
        filterType="All"
        activeRange="all"
        onSelectSession={vi.fn()}
      />
    );

    const s1Item = screen.getByTitle('Click to toggle Sector 1 visibility');
    const s2Item = screen.getByTitle('Click to toggle Sector 2 visibility');
    const s3Item = screen.getByTitle('Click to toggle Sector 3 visibility');

    expect(s1Item).toBeInTheDocument();
    expect(s2Item).toBeInTheDocument();
    expect(s3Item).toBeInTheDocument();

    // Toggle S1 off
    fireEvent.click(s1Item);
    expect(s1Item.className).toContain('line-through');
    // S2 should still be visible
    expect(s2Item.className).not.toContain('line-through');

    // Toggle S2 off
    fireEvent.click(s2Item);
    expect(s2Item.className).toContain('line-through');

    // Toggle S1 back on
    fireEvent.click(s1Item);
    expect(s1Item.className).not.toContain('line-through');
    expect(s2Item.className).toContain('line-through');
  });

  it('allows toggling series in theoretical and consistency metrics', () => {
    const { rerender } = render(
      <ImprovementPaceChart
        chartData={samplePoints}
        metric="theoretical"
        minTime={120}
        maxTime={125}
        activeTrack="Spa"
        selectedCarClass="Hypercar"
        selectedCarModel="All"
        filterType="All"
        activeRange="all"
        onSelectSession={vi.fn()}
      />
    );

    const theoItem = screen.getByTitle('Click to toggle Theoretical Best (S1+S2+S3) visibility');
    expect(theoItem).toBeInTheDocument();
    fireEvent.click(theoItem);
    expect(theoItem.className).toContain('line-through');

    rerender(
      <ImprovementPaceChart
        chartData={samplePoints}
        metric="consistency"
        minTime={80}
        maxTime={100}
        activeTrack="Spa"
        selectedCarClass="Hypercar"
        selectedCarModel="All"
        filterType="All"
        activeRange="all"
        onSelectSession={vi.fn()}
      />
    );

    const consistItem = screen.getByTitle('Click to toggle Pace Consistency Rating (%) visibility');
    expect(consistItem).toBeInTheDocument();
    fireEvent.click(consistItem);
    expect(consistItem.className).toContain('line-through');
  });
});
