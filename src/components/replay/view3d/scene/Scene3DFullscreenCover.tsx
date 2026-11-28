import { Replay3DLoading } from './Replay3DLoading.js';

/**
 * A fullscreen 3D lap view opened from its URL (a refresh, a bookmark) covers the page from the first render with the 3D loading
 * card: the lap's data and the 3D code load first, and the page under it would show until the view takes the screen (driver,
 * 2026-11-28). Just under the expanded view (`z-[1000]`), so the view draws over it once it mounts.
 */
export function Scene3DFullscreenCover() {
  return (
    <div data-testid="scene-3d-fullscreen-cover" className="fixed inset-0 z-[999] bg-lmu-deep">
      <Replay3DLoading onRetry={() => {}} />
    </div>
  );
}
