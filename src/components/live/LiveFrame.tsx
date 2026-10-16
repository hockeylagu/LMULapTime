import { useEffect, useState, type ReactNode } from 'react';

export const FRAME_WIDTH = 2560;
export const FRAME_HEIGHT = 1440;

function fitScale(): number {
  return Math.min(window.innerWidth / FRAME_WIDTH, window.innerHeight / FRAME_HEIGHT);
}

/** A fixed 2560 x 1440 (16:9) stage that scales to the window and is centred; the page is designed in its pixels. */
export function LiveFrame({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-lmu-bg font-sans text-lmu-text">
      <div
        data-testid="live-frame"
        className="absolute left-1/2 top-1/2 flex origin-center flex-col gap-5 overflow-hidden px-14 py-7"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
