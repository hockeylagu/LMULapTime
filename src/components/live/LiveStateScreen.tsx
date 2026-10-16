import type { LiveFigure, LiveScreen } from './liveScreens.js';

const FIGURE_TONE: Record<NonNullable<LiveFigure['tone']>, string> = {
  need: 'text-lmu-text',
  short: 'text-lmu-loss',
  enough: 'text-lmu-gain',
};

/** The big state title with its note and, when known, a row of figures. */
export function LiveStateScreen({ screen }: { screen: LiveScreen }) {
  return (
    <section aria-label="Session state" className="flex min-h-0 flex-1 flex-col justify-center gap-7">
      <h1 className={`text-[164px] font-bold leading-[1.1] tracking-[-0.03em] ${screen.muted ? 'text-lmu-muted' : 'text-lmu-text'}`}>
        {screen.title}
      </h1>
      {screen.note && <p className="text-[64px] font-semibold text-lmu-text-soft">{screen.note}</p>}
      {screen.figures.length > 0 && (
        <div data-testid="live-state-figures" className="mt-14 flex flex-wrap gap-x-20 gap-y-8 self-start rounded-xl bg-lmu-card px-12 py-9">
          {screen.figures.map((figure) => (
            <div key={figure.label} data-tone={figure.tone}>
              <h2 className={`whitespace-nowrap text-[48px] font-semibold ${figure.tone === 'need' ? 'text-lmu-text' : 'text-lmu-text-soft'}`}>{figure.label}</h2>
              <div className={`whitespace-nowrap font-mono text-[120px] font-bold leading-[1.2] tracking-[-0.025em] ${figure.tone ? FIGURE_TONE[figure.tone] : ''}`}>
                {figure.value}
                {figure.unit && <span className="ml-3 text-[56px] font-normal text-lmu-text-soft">{figure.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
