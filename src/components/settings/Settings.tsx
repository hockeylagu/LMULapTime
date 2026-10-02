import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, Search } from 'lucide-react';
import { AppStatus, ReplayScanStatus, ScanStatus } from '../../../shared/types/index.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { updateSearchParams } from '../../utils/urlParams.js';
import { OverviewCard } from './OverviewCard.js';
import { ReferenceLaptimesCard } from './ReferenceLaptimesCard.js';
import { FolderPathsCard } from './FolderPathsCard.js';
import { AISettingsCard } from './AISettingsCard.js';
import { ReplayCacheCard } from './ReplayCacheCard.js';
import { AiReportsHistoryCard } from './AiReportsHistoryCard.js';
import { SettingsSidebar } from './SettingsSidebar.js';
import { useReplayCache } from './replays/useReplayCache.js';
import { useAiSettings } from './hooks/useAiSettings.js';
import { useDeepLinkAlign } from './hooks/useDeepLinkAlign.js';
import {
  SETTINGS_SECTIONS,
  getMissingPaths,
  resolveSectionId,
  matchesSettingsSection,
  orderSettingsSections,
} from './settingsSections.js';
import { useSettingsActions } from './useSettingsActions.js';
import { useSettingsScrollspy } from './useSettingsScrollspy.js';

export interface SettingsProps {
  status: AppStatus | null;
  onUpdatePaths: (resultsDir?: string, replaysDir?: string, telemetryDir?: string) => void;
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
  onReplayScanTriggered?: () => void;
}

function scrollBehavior(): ScrollBehavior {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}

export const Settings: React.FC<SettingsProps> = ({ status, onUpdatePaths, replayScanStatus, onReplayScanTriggered }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();

  const sessionScanStatus = replayScanStatus && 'sessionScan' in replayScanStatus
    ? replayScanStatus.sessionScan
    : undefined;
  const telemetryScanStatus = replayScanStatus && 'telemetryScan' in replayScanStatus
    ? replayScanStatus.telemetryScan
    : undefined;
  // The server refuses to rescan or clear while any file scan runs, so the buttons wait instead of failing.
  const isScanRunning = !!(replayScanStatus?.running || sessionScanStatus?.running || telemetryScanStatus?.running);

  const actions = useSettingsActions({ status, onUpdatePaths, onReplayScanTriggered, isScanRunning });
  const replay = useReplayCache(replayScanStatus);
  const ai = useAiSettings();

  const missingPaths = getMissingPaths(status);
  const setupNeeded = missingPaths.length > 0;

  const matchingSections = useMemo(
    () => orderSettingsSections(SETTINGS_SECTIONS, setupNeeded).filter((s) => matchesSettingsSection(s, searchQuery)),
    [searchQuery, setupNeeded]
  );

  const { activeId: activeSectionId, pin } = useSettingsScrollspy(matchingSections.map((s) => s.id));

  const goToSection = (sectionId: string, updateUrl: boolean, behavior: ScrollBehavior = scrollBehavior()) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    pin(sectionId);
    el.scrollIntoView({ behavior, block: 'start' });
    document.getElementById(`${sectionId}-heading`)?.focus({ preventScroll: true });
    if (updateUrl) updateSearchParams(searchParams, setSearchParams, { section: sectionId });
  };

  // Open on the section named by ?section=<id>. Cards above it load after the first paint, so the
  // alignment is repeated (instantly) while the page grows, until the reader scrolls.
  const requestedSection = useRef<string | null>(null);
  if (requestedSection.current === null) {
    const requested = searchParams.get('section');
    requestedSection.current = resolveSectionId(requested) ?? '';
  }
  useEffect(() => {
    if (requestedSection.current) goToSection(requestedSection.current, false, 'auto');
    // Only the first render honours the link; later changes come from the TOC itself.
  }, []);
  useDeepLinkAlign(requestedSection.current || null, (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  });

  const renderCard = (sectionId: string) => {
    switch (sectionId) {
      case 'overview':
        return (
          <OverviewCard
            status={status}
            replay={replay}
            ai={ai}
            isClearingCache={actions.isClearingCache}
            isScanRunning={isScanRunning}
            onClearCache={actions.handleClearCache}
            cacheMessage={actions.cacheMessage}
          />
        );
      case 'replay-cache':
        return <ReplayCacheCard replay={replay} replayScanStatus={replayScanStatus} />;
      case 'ai-settings':
        return <AISettingsCard ai={ai} />;
      case 'ai-history':
        return <AiReportsHistoryCard />;
      case 'reference-benchmarks':
        return (
          <ReferenceLaptimesCard
            status={status}
            isUpdatingLaptimes={actions.isUpdatingLaptimes}
            onUpdateReferenceLaptimes={actions.handleUpdateReferenceLaptimes}
            laptimesMessage={actions.laptimesMessage}
            updateDiff={actions.updateDiff}
          />
        );
      case 'folder-paths':
        return (
          <FolderPathsCard
            status={status}
            resultsDirInput={actions.resultsDirInput}
            setResultsDirInput={actions.setResultsDirInput}
            replaysDirInput={actions.replaysDirInput}
            setReplaysDirInput={actions.setReplaysDirInput}
            telemetryDirInput={actions.telemetryDirInput}
            setTelemetryDirInput={actions.setTelemetryDirInput}
            playerNameInput={actions.playerNameInput}
            setPlayerNameInput={actions.setPlayerNameInput}
            isScanning={actions.isScanning}
            isScanRunning={isScanRunning}
            pathErrors={actions.pathErrors}
            onScanPaths={actions.handleScanPaths}
            pathMessage={actions.pathMessage}
            sessionScanStatus={sessionScanStatus}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-[1500px] mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight text-lmu-text">Application Settings</h2>
        <p className="text-xs text-lmu-muted mt-1">
          What the app has stored, reference benchmarks, AI lap reports, cached replays and folder paths
        </p>
      </div>

      {setupNeeded && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-lmu-border bg-lmu-card px-4 py-3 text-xs text-lmu-text-soft">
          <AlertCircle className="w-4 h-4 shrink-0 text-lmu-warn" aria-hidden="true" />
          <span>Setup needed: {missingPaths.join(', ')} not found.</span>
          <button
            type="button"
            onClick={() => goToSection('folder-paths', true)}
            className={`font-semibold text-lmu-text underline underline-offset-2 hover:decoration-2 cursor-pointer ${FOCUS_RING}`}
          >
            Fix folder paths
          </button>
        </div>
      )}

      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 items-start">
        <aside className="sticky top-[84px]">
          <SettingsSidebar
            sections={matchingSections}
            activeSectionId={activeSectionId}
            onSelectSection={(id) => goToSection(id, true)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            totalSectionsCount={SETTINGS_SECTIONS.length}
          />
        </aside>

        <div className="min-w-0 space-y-6">
          {matchingSections.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="flex items-center justify-center mx-auto text-lmu-muted">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-lmu-text">No settings found</h3>
              <p className="text-xs text-lmu-muted max-w-sm mx-auto">
                No settings match &quot;{searchQuery}&quot;. Try searching for cache, replays, AI, benchmarks, or paths.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={`${SECONDARY_BUTTON} mt-2`}
              >
                Clear search
              </button>
            </div>
          ) : (
            matchingSections.map((section) => (
              <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-[84px]">
                {renderCard(section.id)}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
