import React from 'react';
import { BrainCircuit, Timer, X } from 'lucide-react';

export type InspectorSidebarTab = 'map' | 'corners' | 'ai-report';

export interface ReplayInspectorSidebarTabsProps {
  activeTab: InspectorSidebarTab;
  setActiveTab: (tab: InspectorSidebarTab) => void;
  cornerCount: number;
  onClosePanel: () => void;
}

const tabClass = (isActive: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer border ${
    isActive
      ? 'bg-lmu-accent text-white border-lmu-accent shadow-md'
      : 'bg-lmu-bg/60 text-lmu-muted hover:text-white border-lmu-border/60 hover:border-lmu-border'
  }`;

/** The Corners / AI Report toggles on top of the inspector sidebar, with a close button while a side panel is open. */
export const ReplayInspectorSidebarTabs: React.FC<ReplayInspectorSidebarTabsProps> = ({
  activeTab,
  setActiveTab,
  cornerCount,
  onClosePanel,
}) => (
  <div className="px-4 py-2 bg-lmu-card border-b border-lmu-border flex items-center justify-between gap-2 shrink-0">
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setActiveTab(activeTab === 'corners' ? 'map' : 'corners')}
        aria-pressed={activeTab === 'corners'}
        className={tabClass(activeTab === 'corners')}
        title={activeTab === 'corners' ? 'Close Corners Panel' : 'Open Corners Panel'}
      >
        <Timer className="w-3.5 h-3.5" /> Corners ({cornerCount})
      </button>
      <button
        type="button"
        onClick={() => setActiveTab(activeTab === 'ai-report' ? 'map' : 'ai-report')}
        aria-pressed={activeTab === 'ai-report'}
        className={tabClass(activeTab === 'ai-report')}
        title={activeTab === 'ai-report' ? 'Close AI Report Panel' : 'Open AI Report Panel'}
      >
        <BrainCircuit className="w-3.5 h-3.5" /> AI Report
      </button>
    </div>

    {activeTab !== 'map' && (
      <button
        type="button"
        onClick={onClosePanel}
        className="inline-flex items-center justify-center w-7 h-7 text-lmu-muted hover:text-white rounded-lg hover:bg-lmu-raised transition-colors cursor-pointer shrink-0"
        aria-label="Close side panel"
        title="Close side panel"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);
