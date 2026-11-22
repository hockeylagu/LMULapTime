import React from 'react';
import { Timer, X } from 'lucide-react';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export type InspectorSidebarTab = 'map' | 'corners';

export interface ReplayInspectorSidebarTabsProps {
  activeTab: InspectorSidebarTab;
  setActiveTab: (tab: InspectorSidebarTab) => void;
  cornerCount: number;
  onClosePanel: () => void;
}

const tabClass = (isActive: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
    isActive
      ? 'bg-lmu-raised text-white border-transparent'
      : 'text-lmu-muted hover:text-white border-transparent'
  }`;

/** The Corners toggle on top of the inspector sidebar, with a close button while a side panel is open. */
export const ReplayInspectorSidebarTabs: React.FC<ReplayInspectorSidebarTabsProps> = ({
  activeTab,
  setActiveTab,
  cornerCount,
  onClosePanel,
}) => (
  <div className="px-4 py-2 bg-lmu-strip border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setActiveTab(activeTab === 'corners' ? 'map' : 'corners')}
        aria-pressed={activeTab === 'corners'}
        className={`${tabClass(activeTab === 'corners')} ${FOCUS_RING}`}
        title={activeTab === 'corners' ? 'Close Corners Panel' : 'Open Corners Panel'}
      >
        <Timer className="w-3.5 h-3.5" /> Corners ({cornerCount})
      </button>
    </div>

    {activeTab !== 'map' && (
      <button
        type="button"
        onClick={onClosePanel}
        className={`inline-flex items-center justify-center w-7 h-7 text-lmu-muted hover:text-white rounded-lg hover:bg-lmu-raised transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
        aria-label="Close side panel"
        title="Close side panel"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);
