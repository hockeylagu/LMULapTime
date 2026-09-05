import React from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import { ComparableLap } from '../../utils/lapComparison';
import { formatTime } from '../../utils/formatters';
import { PaceBadge } from '../common';

export interface CompareLapsTableRowProps {
  lap: ComparableLap;
  isSelected: boolean;
  isBaseline: boolean;
  isAllTimePB: boolean;
  bestAvailableS1: number | null;
  bestAvailableS2: number | null;
  bestAvailableS3: number | null;
  onToggleLap: (lap: ComparableLap) => void;
}

export const CompareLapsTableRow: React.FC<CompareLapsTableRowProps> = ({
  lap,
  isSelected,
  isBaseline,
  isAllTimePB,
  bestAvailableS1,
  bestAvailableS2,
  bestAvailableS3,
  onToggleLap,
}) => {
  const isS1Best =
    lap.isValid && lap.s1 !== null && bestAvailableS1 !== null && Math.abs(lap.s1 - bestAvailableS1) < 0.0005;
  const isS2Best =
    lap.isValid && lap.s2 !== null && bestAvailableS2 !== null && Math.abs(lap.s2 - bestAvailableS2) < 0.0005;
  const isS3Best =
    lap.isValid && lap.s3 !== null && bestAvailableS3 !== null && Math.abs(lap.s3 - bestAvailableS3) < 0.0005;

  return (
    <tr
      className={`hover:bg-lmu-card/50 transition-colors ${
        isBaseline
          ? 'bg-lmu-gold/15'
          : isAllTimePB
          ? 'bg-lmu-gold/15'
          : lap.isSessionBest
          ? 'bg-lmu-gold/10'
          : isSelected
          ? 'bg-lmu-blue/15'
          : ''
      }`}
    >
      <td className="px-3 py-2.5 font-sans">
        <button
          type="button"
          onClick={() => onToggleLap(lap)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            isSelected
              ? 'bg-lmu-accent text-white shadow-sm'
              : 'bg-lmu-bg hover:bg-lmu-border text-white border border-lmu-border'
          }`}
        >
          {isSelected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Added
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              Compare
            </>
          )}
        </button>
      </td>

      <td className="px-3 py-2.5 font-sans">
        <span className="font-bold text-white block">
          {lap.sessionName || 'Session'} ({lap.sessionType || 'P'})
        </span>
        <span className="text-[11px] text-lmu-muted">{lap.dateString}</span>
      </td>

      <td className="px-3 py-2.5 font-sans">
        <span className="font-semibold text-white block truncate max-w-[160px]">{lap.driverName}</span>
        <span className="text-[11px] text-lmu-muted truncate block max-w-[160px]">{lap.carType}</span>
      </td>

      <td className="px-3 py-2.5 text-center font-bold text-white">{lap.lapNum}</td>

      <td
        className={`px-3 py-2.5 text-right font-bold ${
          isAllTimePB
            ? 'text-lmu-gold font-extrabold'
            : lap.isSessionBest
            ? 'text-lmu-gold font-bold'
            : lap.isInferred
            ? 'text-amber-300/80 italic font-mono'
            : 'text-white'
        }`}
      >
        {lap.isInferred ? `~${lap.lapTimeString}` : lap.lapTimeString}
      </td>

      <td className="px-3 py-2.5 text-center font-sans">
        {lap.paceCategory ? (
          <PaceBadge category={lap.paceCategory} size="xs" />
        ) : (
          '-'
        )}
      </td>

      <td
        className={`px-3 py-2.5 text-right font-mono ${isS1Best ? 'text-lmu-gold font-bold' : ''}`}
        title={isS1Best ? 'Best Sector 1' : undefined}
      >
        {lap.s1String || formatTime(lap.s1)}
      </td>
      <td
        className={`px-3 py-2.5 text-right font-mono ${isS2Best ? 'text-lmu-blue font-bold' : ''}`}
        title={isS2Best ? 'Best Sector 2' : undefined}
      >
        {lap.s2String || formatTime(lap.s2)}
      </td>
      <td
        className={`px-3 py-2.5 text-right font-mono ${isS3Best ? 'text-lmu-green font-bold' : ''}`}
        title={isS3Best ? 'Best Sector 3' : undefined}
      >
        {lap.s3String || formatTime(lap.s3)}
      </td>

      <td className="px-3 py-2.5 text-right text-white">
        {lap.topSpeed ? `${lap.topSpeed.toFixed(1)}` : '-'}
      </td>

      <td className="px-3 py-2.5 text-center font-sans">
        {lap.isPitStop ? (
          <span className="text-[10px] text-amber-400 font-bold">PIT</span>
        ) : lap.isOutLap ? (
          <span className="text-[10px] text-cyan-400 font-semibold" title="Out Lap (rejoining track from pit lane)">
            OUT LAP
          </span>
        ) : lap.isValid ? (
          <span className="text-[10px] text-lmu-green font-semibold">Valid</span>
        ) : lap.isInferred ? (
          <span className="text-[10px] text-amber-400 font-semibold">Inferred</span>
        ) : (
          <span className="text-[10px] text-rose-400 font-semibold">Invalid</span>
        )}
      </td>
    </tr>
  );
};
