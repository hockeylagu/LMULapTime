import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { FOCUS_RING } from '../common/buttonStyles.js';

/** Above the navbar while LMU is running: the page was not switched to the live dashboard, so it offers it. */
export function LiveGameBanner() {
  return (
    <div data-testid="live-game-banner" role="status" className="border-b border-lmu-accent/40 bg-lmu-accent/15">
      <div className="mx-auto flex h-9 max-w-[1500px] items-center gap-3 px-8 text-sm">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-lmu-gain" />
        <span className="text-lmu-text-soft">Le Mans Ultimate is running.</span>
        <Link to="/live" className={`flex items-center gap-1.5 rounded font-semibold text-lmu-text hover:text-white ${FOCUS_RING}`}>
          Open the live dashboard
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
