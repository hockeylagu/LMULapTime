import React from 'react';
import { Flag, Trophy } from 'lucide-react';
import { formatTime } from '../utils/formatters.js';

interface TrackSummaryData {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
}

interface TrackSummariesProps {
  tracksMap: Record<string, TrackSummaryData>;
  onSelectTrack: (trackName: string) => void;
}

export const TrackSummaries: React.FC<TrackSummariesProps> = ({ tracksMap, onSelectTrack }) => {
  const trackList = Object.values(tracksMap);

  return (
    <div className="space-y-6">

      {/* Title */}
      <div className="glass-panel p-5 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Flag className="w-6 h-6 text-lmu-gold" />
            Track Records & Benchmarks ({trackList.length} Tracks)
          </h2>
          <p className="text-xs text-lmu-muted mt-1">
            Aggregated best lap times, theoretical best limits, and car stats for each circuit
          </p>
        </div>
      </div>

      {/* Grid of Tracks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {trackList.map(t => (
          <div
            key={t.trackVenue}
            onClick={() => onSelectTrack(t.trackVenue)}
            className="glass-panel glass-panel-hover p-5 rounded-2xl cursor-pointer space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-wide">{t.trackVenue}</h3>
                <p className="text-xs text-lmu-muted mt-0.5">
                  {t.sessionsCount} Sessions • {t.totalLaps} Total Laps
                </p>
              </div>
              <span className="p-2 rounded-xl bg-lmu-gold/10 text-lmu-gold border border-lmu-gold/20">
                <Trophy className="w-5 h-5" />
              </span>
            </div>

            {/* Best Lap vs Theoretical */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-lmu-border/60">
              <div className="bg-lmu-bg/60 p-3 rounded-xl border border-lmu-border/50">
                <p className="text-xs text-lmu-muted font-semibold uppercase">Session Best</p>
                <h4 className="text-xl font-extrabold text-lmu-gold font-mono mt-0.5">
                  {formatTime(t.bestLapTime)}
                </h4>
                <p className="text-[11px] text-lmu-muted mt-1 truncate">
                  By {t.bestLapDriver || 'Driver'} ({t.bestLapCar || 'Car'})
                </p>
              </div>

              <div className="bg-lmu-bg/60 p-3 rounded-xl border border-lmu-border/50">
                <p className="text-xs text-lmu-muted font-semibold uppercase">Theoretical Best</p>
                <h4 className="text-xl font-extrabold text-lmu-green font-mono mt-0.5">
                  {formatTime(t.theoreticalBest)}
                </h4>
                <p className="text-[11px] text-lmu-muted mt-1">
                  Optimal S1 + S2 + S3
                </p>
              </div>
            </div>

            {/* Sector Splits */}
            <div className="flex items-center justify-between text-xs font-mono pt-1 text-lmu-muted">
              <span>S1: <strong className="text-white">{formatTime(t.bestS1)}</strong></span>
              <span>S2: <strong className="text-white">{formatTime(t.bestS2)}</strong></span>
              <span>S3: <strong className="text-white">{formatTime(t.bestS3)}</strong></span>
            </div>

            {/* Cars driven */}
            {t.carsUsed.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-1">
                {t.carsUsed.slice(0, 4).map(car => (
                  <span key={car} className="px-2 py-0.5 text-[10px] font-medium rounded bg-lmu-card text-lmu-muted border border-lmu-border">
                    {car}
                  </span>
                ))}
                {t.carsUsed.length > 4 && (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-lmu-card text-lmu-muted">
                    +{t.carsUsed.length - 4} more
                  </span>
                )}
              </div>
            )}

          </div>
        ))}
      </div>

    </div>
  );
};
