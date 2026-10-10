import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { ReplayInspectorContent } from './inspector/ReplayInspectorContent.js';

export const ReplayInspectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  React.useEffect(() => {
    if (!sessionId) navigate('/dashboard', { replace: true });
  }, [navigate, sessionId]);

  if (!sessionId) return null;

  const driverOrdinal = Number(searchParams.get('driverOrdinal') ?? 0);
  const lapOrdinal = Number(searchParams.get('lapOrdinal') ?? 0);
  const baselineDriverOrdinal = Number(searchParams.get('baselineDriverOrdinal') ?? 0);
  const baselineLapOrdinal = Number(searchParams.get('baselineLapOrdinal'));
  const baselineSession = searchParams.get('baselineSessionId');
  const corner = searchParams.get('corner');

  return (
    <ReplayInspectorContent
      isOpen
      onClose={() => navigate(-1)}
      sessionId={sessionId}
      initialDriverOrdinal={Number.isInteger(driverOrdinal) && driverOrdinal >= 0 ? driverOrdinal : 0}
      initialLapOrdinal={Number.isInteger(lapOrdinal) && lapOrdinal >= 0 ? lapOrdinal : 0}
      onLocatorChange={(driver, lap) => updateSearchParams(searchParams, setSearchParams, {
        driverOrdinal: String(driver),
        lapOrdinal: String(lap),
      })}
      initialCompareMode={Boolean(baselineSession)}
      initialBaselineSessionId={baselineSession}
      initialBaselineDriverOrdinal={Number.isInteger(baselineDriverOrdinal) && baselineDriverOrdinal >= 0 ? baselineDriverOrdinal : 0}
      initialBaselineLapOrdinal={Number.isInteger(baselineLapOrdinal) && baselineLapOrdinal >= 0 ? baselineLapOrdinal : undefined}
      initialCornerNumber={corner ? parseInt(corner, 10) : undefined}
    />
  );
};
