import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { updateSearchParams } from '../../utils/urlParams.js';
import { ReplayInspectorContent } from './inspector/ReplayInspectorContent.js';

export const ReplayInspectorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const viewParam = searchParams.get('view');
  const view: '2d' | '3d' = viewParam === '3d' ? '3d' : '2d';

  useEffect(() => {
    if (!sessionId) {
      void navigate('/dashboard', { replace: true });
      return;
    }
    if (viewParam !== '2d' && viewParam !== '3d') {
      updateSearchParams(searchParams, setSearchParams, { view: '2d' });
    }
  }, [navigate, sessionId, viewParam, searchParams, setSearchParams]);

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
      onClose={() => void navigate(-1)}
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
      view={view}
      onViewChange={(newView) => updateSearchParams(searchParams, setSearchParams, { view: newView })}
    />
  );
};
