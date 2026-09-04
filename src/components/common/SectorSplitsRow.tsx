import React from 'react';
import { formatTime } from '../../utils/formatters.js';

export interface SectorSplitsRowProps {
  s1?: number | null;
  s2?: number | null;
  s3?: number | null;
  s1String?: string;
  s2String?: string;
  s3String?: string;
  className?: string;
}

export const SectorSplitsRow: React.FC<SectorSplitsRowProps> = ({
  s1,
  s2,
  s3,
  s1String,
  s2String,
  s3String,
  className = '',
}) => {
  const s1Val = s1String || formatTime(s1);
  const s2Val = s2String || formatTime(s2);
  const s3Val = s3String || formatTime(s3);

  return (
    <div className={`flex items-center justify-between text-xs font-mono pt-1 text-lmu-muted ${className}`}>
      <span>S1: <strong className="text-white">{s1Val}</strong></span>
      <span>S2: <strong className="text-white">{s2Val}</strong></span>
      <span>S3: <strong className="text-white">{s3Val}</strong></span>
    </div>
  );
};
