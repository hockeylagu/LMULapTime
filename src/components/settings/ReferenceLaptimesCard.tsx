import React from 'react';
import { Database, Globe, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ReferenceBenchmarkDiff } from '../../../server/types';
import { ReferenceChangesList } from './ReferenceChangesList';

export interface ReferenceLaptimesCardProps {
  status: any;
  isUpdatingLaptimes: boolean;
  onUpdateReferenceLaptimes: () => void;
  laptimesMessage: string | null;
  updateDiff: ReferenceBenchmarkDiff | null;
}

export const ReferenceLaptimesCard: React.FC<ReferenceLaptimesCardProps> = ({
  status,
  isUpdatingLaptimes,
  onUpdateReferenceLaptimes,
  laptimesMessage,
  updateDiff,
}) => {
  const lastUpdatedStr = status?.referenceLaptimes?.lastUpdated
    ? new Date(status.referenceLaptimes.lastUpdated).toLocaleString()
    : 'Not cached yet';

  return (
    <div className="glass-panel p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-lmu-gold" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Reference Laptimes Benchmark</h3>
        </div>
        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
          {status?.referenceLaptimes?.entriesCount || 0} Benchmarks Cached
        </span>
      </div>

      <p className="text-xs text-lmu-muted leading-relaxed">
        The reference lap times are used to classify each of your laps into pace categories (<strong>Alien</strong>, <strong>Competitive</strong>, <strong>Good</strong>, <strong>Midpack</strong>, <strong>Tail-ender</strong>, <strong>Offline</strong>). Benchmark data is fetched from the official published spreadsheet and cached locally.
      </p>

      <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-lmu-muted">
            <Globe className="w-4 h-4 text-lmu-cyan shrink-0" />
            <span>Source: Published Google Sheets CSV</span>
            <a
              href="https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-lmu-accent hover:underline ml-1"
            >
              <span>View Sheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-white">
            Last Cached/Updated: <span className="font-mono text-lmu-gold font-semibold">{lastUpdatedStr}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onUpdateReferenceLaptimes}
          disabled={isUpdatingLaptimes}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lmu-gold text-lmu-bg font-extrabold text-xs uppercase tracking-wider hover:bg-amber-400 transition-all shadow-md shadow-lmu-gold/20 shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isUpdatingLaptimes ? 'animate-spin' : ''}`} />
          {isUpdatingLaptimes ? 'Fetching Spreadsheet...' : 'Update Reference Laptimes'}
        </button>
      </div>

      {laptimesMessage && (
        <div className="p-3 rounded-xl bg-lmu-green/10 border border-lmu-green/20 text-xs font-semibold text-lmu-green flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{laptimesMessage}</span>
        </div>
      )}

      {/* Reference Benchmark Changes / What Changed Section */}
      {updateDiff && <ReferenceChangesList updateDiff={updateDiff} />}
    </div>
  );
};
