import React, { useState } from 'react';
import { X, Check, SlidersHorizontal } from 'lucide-react';
import {
  TelemetryPreset,
  TelemetryChannelId,
  AVAILABLE_TELEMETRY_CHANNELS,
} from './telemetryPresets.js';
import { TelemetryPresetChannelRow } from './TelemetryPresetChannelRow.js';
import { TelemetryPresetToolbar } from './TelemetryPresetToolbar.js';
import { TelemetryPresetSidebar } from './TelemetryPresetSidebar.js';

export interface TelemetryPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: TelemetryPreset[];
  activePresetId: string;
  onSavePresets: (presets: TelemetryPreset[]) => void;
  onSelectActivePreset: (presetId: string) => void;
  onResetDefaults: () => void;
}

export const TelemetryPresetModal: React.FC<TelemetryPresetModalProps> = ({
  isOpen,
  onClose,
  presets,
  activePresetId,
  onSavePresets,
  onSelectActivePreset,
  onResetDefaults,
}) => {
  const [selectedId, setSelectedId] = useState<string>(activePresetId);
  const [editingName, setEditingName] = useState<string>('');
  const [isRenaming, setIsRenaming] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentPreset = presets.find(p => p.id === selectedId) || presets[0];

  const handleStartRename = () => {
    if (!currentPreset) return;
    setEditingName(currentPreset.name);
    setIsRenaming(true);
  };

  const handleSaveRename = () => {
    if (!currentPreset || !editingName.trim()) {
      setIsRenaming(false);
      return;
    }
    const updated = presets.map(p =>
      p.id === currentPreset.id ? { ...p, name: editingName.trim() } : p
    );
    onSavePresets(updated);
    setIsRenaming(false);
  };

  const handleToggleChannel = (channelId: TelemetryChannelId) => {
    if (!currentPreset) return;
    const exists = currentPreset.channels.includes(channelId);
    let newChannels: TelemetryChannelId[];
    if (exists) {
      if (currentPreset.channels.length <= 1) return; // Keep at least one
      newChannels = currentPreset.channels.filter(c => c !== channelId);
    } else {
      newChannels = [...currentPreset.channels, channelId];
    }
    const updated = presets.map(p =>
      p.id === currentPreset.id ? { ...p, channels: newChannels } : p
    );
    onSavePresets(updated);
  };

  const handleMoveChannel = (channelId: TelemetryChannelId, direction: 'up' | 'down') => {
    if (!currentPreset) return;
    const idx = currentPreset.channels.indexOf(channelId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentPreset.channels.length) return;

    const reordered = [...currentPreset.channels];
    const [removed] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, removed);

    const updated = presets.map(p =>
      p.id === currentPreset.id ? { ...p, channels: reordered } : p
    );
    onSavePresets(updated);
  };

  const handleCreateNew = () => {
    const newId = `custom-${Date.now()}`;
    const newPreset: TelemetryPreset = {
      id: newId,
      name: `Custom Preset ${presets.length + 1}`,
      isBuiltIn: false,
      channels: ['speed', 'delta', 'throttle', 'brake', 'gear', 'steer'],
    };
    onSavePresets([...presets, newPreset]);
    setSelectedId(newId);
    onSelectActivePreset(newId);
  };

  const handleDuplicate = () => {
    if (!currentPreset) return;
    const newId = `copy-${Date.now()}`;
    const newPreset: TelemetryPreset = {
      id: newId,
      name: `${currentPreset.name} (Copy)`,
      isBuiltIn: false,
      channels: [...currentPreset.channels],
    };
    onSavePresets([...presets, newPreset]);
    setSelectedId(newId);
    onSelectActivePreset(newId);
  };

  const handleDelete = (id: string) => {
    if (presets.length <= 1) return;
    const filtered = presets.filter(p => p.id !== id);
    onSavePresets(filtered);
    if (selectedId === id) {
      setSelectedId(filtered[0].id);
      onSelectActivePreset(filtered[0].id);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-lmu-dark border border-lmu-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
        data-testid="telemetry-preset-modal"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-lmu-card border-b border-lmu-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-lmu-info" />
            <h2 className="text-sm font-bold text-white font-mono tracking-wide">
              Telemetry Channel Presets
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-lmu-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden font-mono text-xs">
          {/* Preset Sidebar */}
          <TelemetryPresetSidebar
            presets={presets}
            selectedId={currentPreset?.id ?? selectedId}
            activePresetId={activePresetId}
            onSelectId={(id) => {
              setSelectedId(id);
              setIsRenaming(false);
            }}
            onCreateNew={handleCreateNew}
            onResetDefaults={onResetDefaults}
          />

          {/* Preset Editor Main Panel */}
          {currentPreset && (
            <div className="flex-1 flex flex-col min-h-0 bg-lmu-surface overflow-hidden p-4 gap-4">
              <TelemetryPresetToolbar
                name={currentPreset.name}
                channelCount={currentPreset.channels.length}
                isRenaming={isRenaming}
                editingName={editingName}
                canDelete={presets.length > 1}
                onEditingNameChange={setEditingName}
                onStartRename={handleStartRename}
                onSaveRename={handleSaveRename}
                onCancelRename={() => setIsRenaming(false)}
                onDuplicate={handleDuplicate}
                onDelete={() => handleDelete(currentPreset.id)}
              />

              {/* Channels List */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
                <div className="text-[10px] font-bold text-lmu-muted uppercase tracking-wider mb-2">
                  Telemetry Channels
                </div>
                {AVAILABLE_TELEMETRY_CHANNELS.map(channel => {
                  const isActive = currentPreset.channels.includes(channel.id);
                  const activeIdx = currentPreset.channels.indexOf(channel.id);
                  const isFirst = activeIdx === 0;
                  const isLast = activeIdx === currentPreset.channels.length - 1;

                  return (
                    <TelemetryPresetChannelRow
                      key={channel.id}
                      channel={channel}
                      isActive={isActive}
                      isFirst={isFirst}
                      isLast={isLast}
                      onToggle={handleToggleChannel}
                      onMove={handleMoveChannel}
                    />
                  );
                })}
              </div>

              {/* Bottom Apply Bar */}
              <div className="pt-3 border-t border-lmu-border/60 flex items-center justify-between shrink-0">
                <span className="text-[10px] text-lmu-muted">
                  Active in replay view: <strong className="text-white">{presets.find(p => p.id === activePresetId)?.name}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectActivePreset(currentPreset.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-lmu-info-strong hover:bg-lmu-info text-lmu-deep font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> Apply & Use Preset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
