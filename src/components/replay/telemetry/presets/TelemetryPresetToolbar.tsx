import React from 'react';
import { Copy, Trash2, Check, Edit2 } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

export interface TelemetryPresetToolbarProps {
  name: string;
  channelCount: number;
  isRenaming: boolean;
  editingName: string;
  canDelete: boolean;
  onEditingNameChange: (name: string) => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Name (with inline rename) and the duplicate / delete actions of the selected preset. */
export const TelemetryPresetToolbar: React.FC<TelemetryPresetToolbarProps> = ({
  name,
  channelCount,
  isRenaming,
  editingName,
  canDelete,
  onEditingNameChange,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDuplicate,
  onDelete,
}) => (
  <div className="flex items-center justify-between gap-2 pb-3 border-b border-lmu-border/60 shrink-0">
    <div className="flex-1 min-w-0">
      {isRenaming ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={editingName}
            onChange={e => onEditingNameChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onSaveRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            autoFocus
            className="bg-black/60 border border-lmu-rule rounded px-2.5 py-1 text-xs text-white font-bold font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text w-full max-w-xs"
          />
          <button
            type="button"
            onClick={onSaveRename}
            className={`px-2 py-1 rounded bg-lmu-raised text-white hover:bg-white/10 transition-colors font-bold text-[10px] cursor-pointer ${FOCUS_RING}`}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white truncate">
            {name}
          </h3>
          <button
            type="button"
            onClick={onStartRename}
            className={`p-1 rounded text-lmu-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer ${FOCUS_RING}`}
            title="Rename preset"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <p className="text-[10px] text-lmu-muted mt-0.5">
        {channelCount} active channels configured
      </p>
    </div>

    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={onDuplicate}
        className={`px-2 py-1 rounded hover:bg-white/10 text-lmu-text-soft text-[10px] flex items-center gap-1 cursor-pointer transition-all ${FOCUS_RING}`}
        title="Duplicate this preset"
      >
        <Copy className="w-3 h-3" /> Duplicate
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className={`px-2 py-1 rounded hover:bg-lmu-loss-strong/15 text-lmu-muted hover:text-lmu-loss-soft text-[10px] flex items-center gap-1 cursor-pointer transition-all ${FOCUS_RING}`}
          title="Delete this preset"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      )}
    </div>
  </div>
);
