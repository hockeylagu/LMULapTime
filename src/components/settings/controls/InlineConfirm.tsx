import React from 'react';
import { SECONDARY_BUTTON } from '../../common/buttonStyles.js';

export interface InlineConfirmProps {
  /** Accessible name of the group. */
  label: string;
  message: string;
  confirmLabel?: string;
  confirmIcon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks "are you sure" in place of the button that started the action. Focus lands on Cancel; Escape cancels. */
export const InlineConfirm: React.FC<InlineConfirmProps> = ({ label, message, confirmLabel = 'Confirm', confirmIcon, onConfirm, onCancel }) => (
  <div
    role="group"
    aria-label={label}
    onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    className="flex flex-wrap items-center gap-2 shrink-0"
  >
    <span className="text-xs text-lmu-text-soft">{message}</span>
    <button type="button" onClick={onConfirm} className={SECONDARY_BUTTON}>
      {confirmIcon}
      {confirmLabel}
    </button>
    <button type="button" autoFocus onClick={onCancel} className={SECONDARY_BUTTON}>
      Cancel
    </button>
  </div>
);
