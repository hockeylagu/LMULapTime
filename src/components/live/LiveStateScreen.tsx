import { LiveGarageChecklist } from './LiveGarageChecklist.js';
import type { LiveScreen } from './liveScreens.js';

/** The big state title with its note and, in the garage, the checklist of what to set before leaving. */
export function LiveStateScreen({ screen }: { screen: LiveScreen }) {
  // With a checklist the title steps down so the things to set lead the screen.
  const checklist = screen.checks.length > 0;
  const title = checklist ? 'text-[120px]' : 'text-[164px]';
  const preparation = screen.preparation;
  return (
    <section aria-label="Session state" className="flex min-h-0 flex-1 flex-col justify-center gap-7">
      <div className="flex items-center justify-between gap-16">
        <div>
          <h1 className={`${title} font-bold leading-[1.1] tracking-[-0.03em] ${screen.muted ? 'text-lmu-muted' : 'text-lmu-text'}`}>
            {screen.title}
          </h1>
          {preparation && <p className="mt-5 text-[64px] font-semibold text-lmu-text-soft">
            {preparation.length}
            {preparation.stopPlan && ` · ${preparation.stopPlan}`}
          </p>}
        </div>
        {preparation && <div aria-label="Estimated session laps" data-testid="live-preparation-laps" className="flex shrink-0 items-baseline gap-6">
          <span className="font-mono text-[180px] font-bold leading-[1.1] tracking-[-0.03em]">{preparation.laps !== null ? `~${preparation.laps}` : '—'}</span>
          <span className="text-[64px] font-semibold text-lmu-text-soft">LAPS</span>
        </div>}
      </div>
      {screen.note && <p className={`${checklist ? 'text-[48px]' : 'text-[64px]'} font-semibold text-lmu-text-soft`}>{screen.note}</p>}
      {checklist && <LiveGarageChecklist checks={screen.checks} />}
    </section>
  );
}
