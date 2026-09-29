import { formatTime } from '../../../../shared/domain/formatters.js';
import { PaceCategory } from '../../../../shared/types/index.js';
import type { SessionProgressionPoint } from './improvementChartTypes.js';
import type { ImprovementMetric } from './ImprovementChartControls.js';
import { calculateLapPrDelta, formatSessionAxisLabel } from './improvementChartUtils.js';

/** One chart row per session: the pace figures, their display strings and the personal-best markers. */
export function buildImprovementChartRows(trackData: SessionProgressionPoint[], personalBestSeries: (number | null)[]) {
  let personalBestBenchmarkCategory: PaceCategory | null = null;

  return trackData.map((p, index) => {
    let movingAvg: number | null = null;
    const windowStart = Math.max(0, index - 2);
    const windowSessions = trackData.slice(windowStart, index + 1).filter((w) => w.bestLapTime !== null && w.bestLapTime > 0);
    if (windowSessions.length > 0) {
      const sum = windowSessions.reduce((acc, curr) => acc + (curr.bestLapTime as number), 0);
      movingAvg = parseFloat((sum / windowSessions.length).toFixed(3));
    }

    const shortSession = p.sessionName || p.sessionType.slice(0, 4);
    const dateFormatted = p.dateString.split(' ')[0] || p.dateString;
    const uniqueKey = `${dateFormatted} ${shortSession} #${index + 1}`;
    const personalBestImproved =
      p.bestLapTime !== null &&
      p.bestLapTime > 0 &&
      p.bestLapTime === personalBestSeries[index] &&
      (index === 0 || personalBestSeries[index - 1] !== personalBestSeries[index]);

    if (personalBestImproved && p.benchmarkCategory) {
      personalBestBenchmarkCategory = p.benchmarkCategory;
    }

    return {
      chartKey: uniqueKey,
      shortSession,
      axisLabel: formatSessionAxisLabel(p.dateString, shortSession),
      fullDate: p.dateString,
      sessionId: p.sessionId,
      session: p.sessionName ? `${p.sessionType} (${p.sessionName})` : p.sessionType,
      car: p.carType,
      weather: p.weatherInfo,
      bestLap: p.bestLapTime,
      top3Avg: p.top3AvgLapTime ?? null,
      top3AvgStr: p.top3AvgLapTime ? formatTime(p.top3AvgLapTime) : null,
      movingAvg,
      avgLap: p.avgLapTime,
      bestPr: personalBestSeries[index],
      lapPrDelta: calculateLapPrDelta(p.bestLapTime, index > 0 ? personalBestSeries[index - 1] : null),
      personalBestImproved,
      benchmarkCategory: p.benchmarkCategory ?? null,
      benchmarkPercentage: p.benchmarkPercentage ?? null,
      personalBestBenchmarkCategory,
      theoretical: p.theoreticalBest,
      theoreticalGap: p.theoreticalGap ?? null,
      consistencyScore: p.consistencyScore ?? null,
      s1: p.bestS1,
      s2: p.bestS2,
      s3: p.bestS3,
      lapStr: formatTime(p.bestLapTime),
      theoreticalStr: formatTime(p.theoreticalBest),
      avgLapStr: formatTime(p.avgLapTime),
      cleanLaps: p.cleanLapsCount,
      replay: p.matchingReplayFile,
    };
  });
}

export type ImprovementChartRow = ReturnType<typeof buildImprovementChartRows>[number];

/** The y-axis range of the chosen metric: the plotted times padded by 2 s (consistency is a 70-100 score). */
export function getImprovementAxisBounds(
  metric: ImprovementMetric,
  trackData: SessionProgressionPoint[],
  chartData: ImprovementChartRow[]
): { minTime: number; maxTime: number } {
  const validTimes = (
    metric === 'sectors'
      ? trackData.flatMap((p) => [p.bestS1, p.bestS2, p.bestS3])
      : metric === 'bestPr'
      ? chartData.map((c) => c.bestPr)
      : metric === 'consistency'
      ? chartData.map((c) => c.consistencyScore).filter((c): c is number => c !== null && c > 0)
      : [...trackData.flatMap((p) => [p.bestLapTime, p.avgLapTime, p.top3AvgLapTime]), ...chartData.map((c) => c.movingAvg)]
  ).filter((t): t is number => t !== null && t !== undefined && !isNaN(t) && t > 0);

  const minTime =
    metric === 'consistency'
      ? validTimes.length > 0
        ? Math.max(70, Math.floor(Math.min(...validTimes) - 2))
        : 80
      : validTimes.length > 0
      ? Math.max(0, Math.floor(Math.min(...validTimes) - 2))
      : 0;

  const maxTime = metric === 'consistency' ? 100 : validTimes.length > 0 ? Math.ceil(Math.max(...validTimes) + 2) : 100;

  return { minTime, maxTime };
}
