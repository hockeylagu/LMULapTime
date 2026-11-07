/**
 * Page-side probe for the 3D replay frame-time benchmark. Injected before the app loads (Playwright `addInitScript`), so it is
 * self-contained: no imports, no closures over module state. It wraps WebGL 2 calls to count draws per framebuffer, upload bytes and
 * program links, times the page's animation-frame callbacks, records every animation frame while recording, and collects long tasks.
 */

export interface ProbeFrame {
  /** Time since the previous animation frame (ms). */
  intervalMs: number;
  /** Draw calls of the main pass: into the default framebuffer or a multisampled one (the auto-exposure HDR target the scene
   * renders into; its full-screen output quad onto the canvas counts too). */
  mainDraws: number;
  /** Draw calls into other framebuffers (shadow maps, warm-up probes, PMREM, exposure metering). */
  offscreenDraws: number;
  /** Bytes passed to buffer and texture upload calls during the frame. */
  uploadBytes: number;
  /** Shader programs linked during the frame (D3D11 ANGLE may finish compiling at the first draw that uses one). */
  programLinks: number;
  /** Main-thread time spent in the page's animation-frame callbacks (ms): the frame's script and render submission, without the
   * GPU waits, compositor and idle time an interval also holds. Steadier than the interval for comparing two builds. */
  callbackMs: number;
}

export interface ProbeState {
  recording: boolean;
  frames: ProbeFrame[];
  longTasks: {startMs: number; durationMs: number}[];
  /** Programs linked while recording. */
  programLinks: number;
}

interface ProbeWindow { replay3dProbe: ProbeState }

/** `skipOffscreenDraws` is an experiment switch: draws into other single-sampled framebuffers (shadow maps, warm-up probes) are dropped, so a
 * run with and without it isolates what the shadow passes cost. The picture loses its shadows; never use it for a baseline. */
export function installProbe(skipOffscreenDraws: boolean): void {
  const state: ProbeState = {recording: false, frames: [], longTasks: [], programLinks: 0};
  (window as unknown as ProbeWindow).replay3dProbe = state;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) state.longTasks.push({startMs: entry.startTime, durationMs: entry.duration});
  }).observe({type: 'longtask', buffered: true});

  let current = {mainDraws: 0, offscreenDraws: 0, uploadBytes: 0, programLinks: 0, callbackMs: 0}, offscreen = false;
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const wrap = (name: string, before: (args: unknown[]) => void) => {
    const original = proto[name];
    proto[name] = function (this: unknown, ...args: unknown[]) { before(args); return original.apply(this, args); };
  };
  // The scene pass renders into a multisampled target: framebuffers with a multisampled renderbuffer attached count as main.
  const multisampled = new Set<unknown>(), mainFramebuffers = new Set<unknown>();
  let renderbuffer: unknown = null, framebuffer: unknown = null;
  wrap('bindRenderbuffer', args => { renderbuffer = args[1]; });
  wrap('renderbufferStorageMultisample', args => { if (Number(args[1]) > 0) multisampled.add(renderbuffer); });
  wrap('framebufferRenderbuffer', args => { if (multisampled.has(args[3])) mainFramebuffers.add(framebuffer); });
  wrap('bindFramebuffer', args => { framebuffer = args[1]; offscreen = args[1] !== null && !mainFramebuffers.has(args[1]); });
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
    const original = proto[name];
    proto[name] = function (this: unknown, ...args: unknown[]) {
      if (!offscreen) { current.mainDraws++; return original.apply(this, args); }
      current.offscreenDraws++;
      return skipOffscreenDraws ? undefined : original.apply(this, args);
    };
  }
  const bytesOf = (args: unknown[]) => {
    for (const arg of args) if (ArrayBuffer.isView(arg)) return arg.byteLength;
    return 0;
  };
  for (const name of ['bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'texSubImage3D', 'compressedTexSubImage3D']) {
    wrap(name, args => { current.uploadBytes += bytesOf(args); });
  }
  wrap('linkProgram', () => { current.programLinks++; if (state.recording) state.programLinks++; });

  const nativeFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => nativeFrame(now => {
    const started = performance.now();
    try { callback(now); } finally { current.callbackMs += performance.now() - started; }
  });
  let last = performance.now();
  const tick = (now: number) => {
    if (state.recording) state.frames.push({intervalMs: now - last, ...current});
    current = {mainDraws: 0, offscreenDraws: 0, uploadBytes: 0, programLinks: 0, callbackMs: 0};
    last = now;
    nativeFrame(tick);
  };
  nativeFrame(tick);
}
