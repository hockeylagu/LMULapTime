import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { getSettingsSection } from './settingsSections.js';

export interface SettingsFeedback {
  tone: 'ok' | 'error';
  text: string;
}

/**
 * Result of an action: failures are loss with an alert icon (announced at once as an alert), successes gain
 * with a check (announced politely as status). Long server messages and names wrap instead of widening the card.
 */
export const FeedbackMessage: React.FC<{ feedback: SettingsFeedback | null }> = ({ feedback }) => {
  if (!feedback) return null;
  const isError = feedback.tone === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      data-tone={feedback.tone}
      className={`min-w-0 text-xs font-semibold flex items-start gap-2 ${isError ? 'text-lmu-loss' : 'text-lmu-gain'}`}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{feedback.text}</span>
    </div>
  );
};

export interface SettingsPanelProps {
  sectionId: string;
  /** Right side of the heading row: a count, a refresh button, a switch. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/** A section panel with the Panel Heading (title and icon come from the section list, so the TOC always matches). */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ sectionId, aside, children }) => {
  const section = getSettingsSection(sectionId);
  const Icon = section?.icon;
  return (
    <div className="bg-lmu-card rounded-2xl p-6 border border-lmu-border space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lmu-border pb-3">
        <h3
          id={`${sectionId}-heading`}
          tabIndex={-1}
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-lmu-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lmu-accent-text"
        >
          {Icon && <Icon className="w-4 h-4 text-lmu-muted" aria-hidden="true" />}
          {section?.title ?? sectionId}
        </h3>
        {aside}
      </div>
      {children}
    </div>
  );
};
