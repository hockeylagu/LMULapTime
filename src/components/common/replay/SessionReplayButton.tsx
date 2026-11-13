import React from 'react';
import { Link, useNavigate } from 'react-router';
import { ListOrdered } from 'lucide-react';
import { useSessionDataContext } from '../../../api/sessionDataContext.js';
import { linkClickHandler } from '../../../utils/linkClick.js';
import { FOCUS_RING } from '../buttonStyles.js';

export interface SessionReplayButtonProps {
  sessionId: string;
  to: string;
  className?: string;
  'data-testid'?: string;
}

const DEFAULT_CLASS =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-lmu-border bg-lmu-card text-xs font-semibold text-lmu-text-soft hover:text-white hover:border-lmu-rule transition-colors cursor-pointer';

/** Opens the full-session multi-car replay directly, hidden while the session's replay decode is unavailable. */
export const SessionReplayButton: React.FC<SessionReplayButtonProps> = ({
  sessionId,
  to,
  className = DEFAULT_CLASS,
  'data-testid': testId,
}) => {
  const navigate = useNavigate();
  const { scan } = useSessionDataContext();
  const job = scan?.sessionReplayJobs?.find((item) => item.sessionId === sessionId);
  const blocked = job?.status === 'processing'
    || (job?.status === 'queued' && !job.playable)
    || (job?.status === 'failed' && !job.playable);

  if (blocked) return null;

  return (
    <Link
      to={to}
      onClick={linkClickHandler(() => { void navigate(to); })}
      title="Session replay: every car of the session on one clock"
      className={`${className} ${FOCUS_RING}`}
      data-testid={testId}
    >
      <ListOrdered aria-hidden="true" className="w-3.5 h-3.5 text-lmu-accent-text" />
      <span>Session replay</span>
    </Link>
  );
};
