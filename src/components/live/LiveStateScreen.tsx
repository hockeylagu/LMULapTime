import { LiveGarageChecklist } from './LiveGarageChecklist.js';
import type { LiveScreen } from './liveScreens.js';

/** The big state title with its note and, in the garage, the checklist of what to set before leaving. */
export function LiveStateScreen({ screen }: { screen: LiveScreen }) {
  // With a checklist the title steps down so the things to set lead the screen.
  const checklist = screen.checks.length > 0;
  const title = checklist ? 'text-[120px]' : 'text-[164px]';
  return (
    <section aria-label="Session state" className="flex min-h-0 flex-1 flex-col justify-center gap-7">
      <h1 className={`${title} font-bold leading-[1.1] tracking-[-0.03em] ${screen.muted ? 'text-lmu-muted' : 'text-lmu-text'}`}>
        {screen.title}
      </h1>
      {screen.note && <p className={`${checklist ? 'text-[48px]' : 'text-[64px]'} font-semibold text-lmu-text-soft`}>{screen.note}</p>}
      {checklist && <LiveGarageChecklist checks={screen.checks} />}
    </section>
  );
}
