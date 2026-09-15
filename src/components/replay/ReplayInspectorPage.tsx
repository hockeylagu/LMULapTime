import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { ReplayInspectorContent } from './inspector/ReplayInspectorContent.js';

export const ReplayInspectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const replayName = searchParams.get('replayName');

  React.useEffect(() => {
    if (!replayName) navigate('/dashboard', { replace: true });
  }, [navigate, replayName]);

  if (!replayName) return null;

  const lap = searchParams.get('lap');
  const baselineLap = searchParams.get('compareLapNum');

  return (
    <ReplayInspectorContent
      isOpen
      onClose={() => navigate(-1)}
      replayName={replayName}
      initialLapNumber={lap ? parseInt(lap, 10) : undefined}
      initialDriverName={searchParams.get('driverName')}
      onLapChange={(lapNumber) => updateSearchParams(searchParams, setSearchParams, { lap: String(lapNumber) })}
      initialCompareMode={Boolean(searchParams.get('baselineReplay'))}
      initialBaselineReplayName={searchParams.get('baselineReplay')}
      initialBaselineLapNumber={baselineLap ? parseInt(baselineLap, 10) : undefined}
      initialBaselineDriverName={searchParams.get('compareDriver')}
    />
  );
};
