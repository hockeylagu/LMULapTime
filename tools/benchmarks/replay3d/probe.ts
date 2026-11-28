/**
 * Page-side probe for the 3D replay frame-time benchmark. Injected before the app loads (Playwright `addInitScript`), so it is
 * self-contained: no imports, no closures over module state. It wraps WebGL 2 calls to count the work of each pass (draws, the
 * draws inside multi-draw calls, indices, uniform and texture-bind calls, cube faces drawn), times the page's animation-frame
 * callbacks and the main-thread time each pass holds, records every animation frame while recording, and collects long tasks.
 * With a fixed step, every animation frame hands the page a timestamp one step after the last: the replay, which advances by those
 * timestamps, shows the same moments in every run however long a frame takes, while `performance.now()` stays real.
 */

/** The passes a frame's work is split into, by the framebuffer bound while it runs. */
export const PASSES = ['script', 'main', 'probe', 'depth', 'other'] as const;
export type Pass = typeof PASSES[number];
/**
 * - script: the frame's work before it binds any framebuffer (replay clock, streaming, content, matrices);
 * - main: the scene pass (a multisampled target) and the canvas (the default framebuffer: tone-mapped output);
 * - probe: cube-map faces (the car's reflection probe and its convolution);
 * - depth: targets with a depth texture (shadow cascades, the car's overhead map);
 * - other: every other target (bloom, exposure metering, PMREM, readout canvases, the under-car bake, pointer picking).
 */
export interface PassWork {
  /** Draw calls, a multi-draw call counted once. */
  calls: number;
  /** Draws: plain draw calls plus every draw inside a multi-draw call (batched scenery and cars). */
  draws: number;
  /** Indices or vertices submitted, in thousands. */
  kIndices: number;
  /** `uniform*` calls. */
  uniforms: number;
  /** `bindTexture` calls. */
  textureBinds: number;
  /** Main-thread time while this pass's framebuffer was bound (ms): the script that issued it, not its GPU time. */
  cpuMs: number;
  /**
   * GPU time of the pass's commands (ms, EXT_disjoint_timer_query_webgl2, one query per span the pass's framebuffer is bound in a
   * frame). Results land a few frames late, into the frame that issued them; 0 without the extension (`ProbeState.gpuTimer`).
   */
  gpuMs: number;
}

export interface ProbeFrame {
  /** Time since the previous animation frame (ms, real time). */
  intervalMs: number;
  /** Bytes passed to buffer and texture upload calls during the frame. */
  uploadBytes: number;
  /** The part of `uploadBytes` sent to buffers (`bufferData`, `bufferSubData`); the rest went to textures. */
  bufferUploadBytes: number;
  /** Shader programs linked during the frame (D3D11 ANGLE may finish compiling at the first draw that uses one). */
  programLinks: number;
  /** Cube-map faces drawn as a scene: level 0 faces that took more than one draw (the reflection probe's faces, not the
   * convolution's one quad a face). */
  cubeFaces: number;
  /** Main-thread time spent in the page's animation-frame callbacks (ms): the frame's script and render submission, without the
   * GPU waits, compositor and idle time an interval also holds. Steadier than the interval for comparing two builds. */
  callbackMs: number;
  /** The frame's work by pass. */
  passes: Record<Pass, PassWork>;
}

export interface ProbeState {
  recording: boolean;
  frames: ProbeFrame[];
  longTasks: {startMs: number; durationMs: number}[];
  /** Programs linked while recording. */
  programLinks: number;
  /** Each program linked while recording: the recorded frame it fell in, the pass it linked in and its `SHADER_NAME`. */
  linkNames: {frame: number; pass: string; name: string}[];
  /** The fixed step (ms) the animation-frame timestamps advance by, or 0 for real time. */
  stepMs: number;
  /** Puts the fixed clock back on real time (the bench calls it as it starts recording). */
  syncClock(): void;
  /** Whether the context has GPU timer queries (`PassWork.gpuMs`). */
  gpuTimer: boolean;
  /** GPU timings dropped because the GPU reported a disjoint (a clock change or context switch voids queries in flight). */
  gpuDropped: number;
  /** With the uniform diagnostic, while recording: where three's uniform work goes. */
  uniformStats?: UniformStats;
}

/**
 * The uniform diagnostic: three walks every uniform of a program each time a draw refreshes its material, and calls `uniform*` only
 * for values that changed. Per pass, the `uniform*` calls by uniform name (what changes between draws); per program, its active
 * uniforms (what each refresh walks) and how often each pass switched to it and drew with it.
 */
export interface UniformStats {
  callsByPass: Record<Pass, Record<string, number>>;
  programs: {
    /** The program's `SHADER_NAME` and composed parts. */
    name: string;
    /** Active uniforms, samplers among them, and floats in array uniforms (three flattens an array to compare it). */
    uniforms: number; samplers: number; arrayFloats: number;
    /** A few names, to tell the programs apart. */
    sample: string[];
    switches: Record<Pass, number>; calls: Record<Pass, number>; draws: Record<Pass, number>;
  }[];
}

interface ProbeWindow { replay3dProbe: ProbeState }

/** `skipOffscreenDraws` is an experiment switch: draws into other single-sampled framebuffers (shadow maps, warm-up probes) are dropped, so a
 * run with and without it isolates what the shadow passes cost. The picture loses its shadows; never use it for a baseline.
 * `stepMs`: the fixed animation-frame step (0: real time). `uniformNames`: the uniform diagnostic (`UniformStats`), which adds a
 * cost per uniform call: compare its runs with each other only. */
export function installProbe(skipOffscreenDraws: boolean, stepMs: number, uniformNames = false): void {
  const PASS_NAMES = ['script', 'main', 'probe', 'depth', 'other'] as const;
  const empty = () => ({calls: 0, draws: 0, kIndices: 0, uniforms: 0, textureBinds: 0, cpuMs: 0, gpuMs: 0});
  const fresh = () => ({uploadBytes: 0, bufferUploadBytes: 0, programLinks: 0, cubeFaces: 0, callbackMs: 0,
    passes: Object.fromEntries(PASS_NAMES.map(name => [name, empty()])) as Record<typeof PASS_NAMES[number], ReturnType<typeof empty>>});
  // The fixed clock: one step per animation frame, every callback of a frame seeing the same time.
  let virtual = performance.now(), lastNative = -1;
  const state: ProbeState = {recording: false, frames: [], longTasks: [], programLinks: 0, linkNames: [], stepMs, syncClock() { virtual = performance.now(); }, gpuTimer: false, gpuDropped: 0};
  (window as unknown as ProbeWindow).replay3dProbe = state;
  // The default buffer keeps 250 resource entries: a first view fetches several hundred package files, so the rest would go uncounted.
  performance.setResourceTimingBufferSize(10_000);
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) state.longTasks.push({startMs: entry.startTime, durationMs: entry.duration});
  }).observe({type: 'longtask', buffered: true});

  let current = fresh();
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const wrap = (target: Record<string, (...args: unknown[]) => unknown>, name: string, before: (args: unknown[], context: unknown) => void) => {
    const original = target[name];
    target[name] = function (this: unknown, ...args: unknown[]) { before(args, this); return original.apply(this, args); };
  };

  // GPU time per pass span: a TIME_ELAPSED query from the span's start to its end (one may run at a time, so spans never nest), read
  // once available and added to the pass of the frame that issued it.
  interface TimerContext {
    getExtension(name: string): {TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number} | null;
    createQuery(): unknown; beginQuery(target: number, query: unknown): void; endQuery(target: number): void;
    getQueryParameter(query: unknown, name: number): unknown; getParameter(name: number): unknown;
  }
  let timer: {gl: TimerContext; elapsed: number; disjoint: number} | null | undefined;
  let timing: {query: unknown; work: {gpuMs: number}} | null = null;
  const inFlight: {query: unknown; work: {gpuMs: number}}[] = [], spare: unknown[] = [];
  const timerOf = (context: unknown) => {
    if (timer !== undefined || !context) return;
    const gl = context as TimerContext, extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    timer = extension ? {gl, elapsed: extension.TIME_ELAPSED_EXT, disjoint: extension.GPU_DISJOINT_EXT} : null;
    state.gpuTimer = !!timer;
  };
  const endTiming = () => {
    if (!timer || !timing) return;
    timer.gl.endQuery(timer.elapsed); inFlight.push(timing); timing = null;
  };
  const beginTiming = (work: {gpuMs: number}) => {
    if (!timer) return;
    const query = spare.pop() ?? timer.gl.createQuery();
    timer.gl.beginQuery(timer.elapsed, query); timing = {query, work};
  };
  /** Reads the queries done so far, in issue order; a disjoint voids every query in flight. */
  const collectTimings = () => {
    if (!timer || !inFlight.length) return;
    const {gl} = timer;
    if (gl.getParameter(timer.disjoint)) { state.gpuDropped += inFlight.length; spare.push(...inFlight.splice(0).map(({query}) => query)); return; }
    while (inFlight.length && gl.getQueryParameter(inFlight[0].query, WebGL2RenderingContext.QUERY_RESULT_AVAILABLE)) {
      const done = inFlight.shift()!;
      done.work.gpuMs += Number(gl.getQueryParameter(done.query, WebGL2RenderingContext.QUERY_RESULT)) / 1e6;
      spare.push(done.query);
    }
  };

  // Each framebuffer's pass, from what is attached to it. The scene pass renders into a multisampled target.
  const GL = WebGL2RenderingContext;
  // Shadow cascades and the overhead map attach a depth texture beside a red colour target; the scene pass's own depth texture sits
  // on its multisampled target, so `main` wins.
  const multisampled = new Set<unknown>(), kinds = new Map<unknown, {cube: boolean; depthTexture: boolean; main: boolean}>();
  let renderbuffer: unknown = null, framebuffer: unknown = null, pass: typeof PASS_NAMES[number] = 'script', spanStart = 0, inFrame = false;
  /** The draw framebuffer and its pass: draws count there (a read-only bind, for a blit or read-back, leaves it). */
  let boundDraw: unknown = null, drawPass: typeof PASS_NAMES[number] = 'main';
  /** Draws into the cube face attached last: a scene face takes many (sky, batches), the convolution's one quad a level. */
  let faceDraws = -1;
  const closeFace = () => { if (faceDraws > 1) current.cubeFaces++; faceDraws = -1; };
  const kindOf = (fb: unknown) => { let kind = kinds.get(fb); if (!kind) kinds.set(fb, kind = {cube: false, depthTexture: false, main: false}); return kind; };
  const passOf = (fb: unknown): typeof PASS_NAMES[number] => {
    if (fb === null) return 'main';
    const kind = kindOf(fb);
    return kind.main ? 'main' : kind.cube ? 'probe' : kind.depthTexture ? 'depth' : 'other';
  };
  /** Closes the running span into its pass and opens one for the next. */
  const enter = (next: typeof PASS_NAMES[number]) => {
    const now = performance.now();
    if (inFrame) current.passes[pass].cpuMs += now - spanStart;
    pass = next; spanStart = now;
    // The script span draws nothing: no query for it (nor outside frames: loading, warm-ups).
    endTiming();
    if (inFrame && next !== 'script') beginTiming(current.passes[next]);
  };
  wrap(proto, 'bindRenderbuffer', args => { renderbuffer = args[1]; });
  wrap(proto, 'renderbufferStorageMultisample', args => { if (Number(args[1]) > 0) multisampled.add(renderbuffer); });
  wrap(proto, 'framebufferRenderbuffer', args => { if (multisampled.has(args[3])) kindOf(framebuffer).main = true; });
  wrap(proto, 'framebufferTexture2D', (args, context) => {
    timerOf(context);
    const kind = kindOf(framebuffer), textarget = Number(args[2]);
    if (args[1] === GL.DEPTH_ATTACHMENT || args[1] === GL.DEPTH_STENCIL_ATTACHMENT) kind.depthTexture = true;
    if (framebuffer !== boundDraw) return;
    closeFace();
    if (textarget >= GL.TEXTURE_CUBE_MAP_POSITIVE_X && textarget <= GL.TEXTURE_CUBE_MAP_NEGATIVE_Z) { kind.cube = true; if (Number(args[4]) === 0) faceDraws = 0; }
    drawPass = passOf(framebuffer); enter(drawPass); // Attached to the bound target: its pass may change.
  });
  wrap(proto, 'bindFramebuffer', (args, context) => {
    timerOf(context);
    framebuffer = args[1];
    if (args[0] === GL.READ_FRAMEBUFFER) return;
    closeFace();
    boundDraw = args[1]; drawPass = passOf(args[1]);
    enter(drawPass);
  });
  /** A program's `SHADER_NAME` and, for a composed one, the parts its source names in comments (`// part`): an unnamed material is told apart by them. */
  const programName = (context: unknown, linked: unknown) => {
    const gl = context as {getAttachedShaders(p: unknown): unknown[] | null; getShaderSource(s: unknown): string | null};
    const source = (gl.getAttachedShaders(linked) ?? []).map(shader => gl.getShaderSource(shader) ?? '').join('\n');
    const parts = [...new Set(source.match(/^\/\/ [\w-]+$/gm) ?? [])].map(line => line.slice(3)).join('+');
    return `${/#define SHADER_NAME (.*)/.exec(source)?.[1] || '(unnamed)'}${parts ? ` [${parts}]` : ''}`;
  };
  // The uniform diagnostic: names of uniform locations, each program's inventory, the program in use.
  const byPass = () => Object.fromEntries(PASS_NAMES.map(name => [name, 0])) as Record<typeof PASS_NAMES[number], number>;
  const stats: UniformStats = {callsByPass: Object.fromEntries(PASS_NAMES.map(name => [name, {}])) as UniformStats['callsByPass'], programs: []};
  const locationNames = new WeakMap<object, string>(), programStats = new Map<unknown, UniformStats['programs'][number]>();
  let program: UniformStats['programs'][number] | undefined;
  if (uniformNames) {
    state.uniformStats = stats;
    const getUniformLocation = proto.getUniformLocation;
    proto.getUniformLocation = function (this: unknown, ...args: unknown[]) {
      const location = getUniformLocation.apply(this, args);
      if (location) locationNames.set(location, String(args[1]));
      return location;
    };
    const useProgram = proto.useProgram;
    proto.useProgram = function (this: unknown, ...args: unknown[]) {
      const result = useProgram.apply(this, args);
      if (!state.recording || !args[0]) { program = undefined; return result; }
      program = programStats.get(args[0]);
      if (!program) {
        const gl = this as {getProgramParameter(p: unknown, name: number): unknown; getActiveUniform(p: unknown, i: number): {name: string; type: number; size: number} | null};
        const active = Number(gl.getProgramParameter(args[0], GL.ACTIVE_UNIFORMS));
        program = {name: programName(this, args[0]), uniforms: active, samplers: 0, arrayFloats: 0, sample: [], switches: byPass(), calls: byPass(), draws: byPass()};
        const floats: Record<number, number> = {[GL.FLOAT]: 1, [GL.FLOAT_VEC2]: 2, [GL.FLOAT_VEC3]: 3, [GL.FLOAT_VEC4]: 4, [GL.FLOAT_MAT3]: 9, [GL.FLOAT_MAT4]: 16};
        for (let i = 0; i < active; i++) {
          const info = gl.getActiveUniform(args[0], i);
          if (!info) continue;
          if (([GL.SAMPLER_2D, GL.SAMPLER_CUBE, GL.SAMPLER_2D_SHADOW, GL.SAMPLER_2D_ARRAY, GL.SAMPLER_3D] as number[]).includes(info.type)) program.samplers++;
          if (info.size > 1) program.arrayFloats += info.size * (floats[info.type] ?? 1);
          if (program.sample.length < 6 && !info.name.startsWith('gl_')) program.sample.push(info.name);
        }
        programStats.set(args[0], program); stats.programs.push(program);
      }
      program.switches[pass]++;
      return result;
    };
  }
  const count = (calls: number, draws: number, indices: number) => {
    const work = current.passes[drawPass];
    work.calls += calls; work.draws += draws; work.kIndices += indices / 1000;
    if (faceDraws >= 0) faceDraws += draws;
    if (program) { program.calls[drawPass] += calls; program.draws[drawPass] += draws; }
  };
  for (const [name, at] of [['drawElements', 1], ['drawArrays', 2], ['drawElementsInstanced', 1], ['drawArraysInstanced', 2], ['drawRangeElements', 3]] as const) {
    const original = proto[name];
    proto[name] = function (this: unknown, ...args: unknown[]) {
      count(1, 1, Number(args[at]) || 0);
      return drawPass !== 'main' && skipOffscreenDraws ? undefined : original.apply(this, args);
    };
  }
  // Batched meshes draw through WEBGL_multi_draw: one call, `drawcount` draws.
  const getExtension = proto.getExtension;
  const wrappedExtensions = new WeakSet<object>();
  proto.getExtension = function (this: unknown, ...args: unknown[]) {
    const extension = getExtension.apply(this, args) as Record<string, (...a: unknown[]) => unknown> | null;
    if (extension && args[0] === 'WEBGL_multi_draw' && !wrappedExtensions.has(extension)) {
      wrappedExtensions.add(extension);
      const sum = (list: unknown, offset: unknown, n: number) => { let total = 0; const values = list as ArrayLike<number>; for (let i = 0; i < n; i++) total += values[Number(offset) + i] ?? 0; return total; };
      for (const [name, countsAt, drawCountAt] of [['multiDrawElementsWEBGL', 1, 6], ['multiDrawArraysWEBGL', 3, 5], ['multiDrawElementsInstancedWEBGL', 1, 8], ['multiDrawArraysInstancedWEBGL', 3, 7]] as const) {
        const original = extension[name];
        if (!original) continue;
        extension[name] = function (this: unknown, ...a: unknown[]) {
          const n = Number(a[drawCountAt]) || 0;
          count(1, n, sum(a[countsAt], a[countsAt + 1], n));
          return drawPass !== 'main' && skipOffscreenDraws ? undefined : original.apply(this, a);
        };
      }
    }
    return extension;
  };
  for (const name of Object.getOwnPropertyNames(proto).filter(name => name.startsWith('uniform') && name !== 'uniformBlockBinding')) {
    wrap(proto, name, args => {
      current.passes[pass].uniforms++;
      if (uniformNames && state.recording) {
        const calls = stats.callsByPass[pass], location = args[0];
        const uniform = (typeof location === 'object' && location !== null ? locationNames.get(location) : undefined) ?? '(unknown)';
        calls[uniform] = (calls[uniform] ?? 0) + 1;
      }
    });
  }
  wrap(proto, 'bindTexture', () => { current.passes[pass].textureBinds++; });
  /** The bytes a call uploads: a `bufferSubData` with a source offset (and length, in elements) sends only that part of its array. */
  const bytesOf = (args: unknown[], name: string) => {
    for (const [i, arg] of args.entries()) {
      if (!ArrayBuffer.isView(arg)) continue;
      const size = 'BYTES_PER_ELEMENT' in arg ? Number(arg.BYTES_PER_ELEMENT) : 1, offset = Number(args[i + 1] ?? 0), length = Number(args[i + 2] ?? 0);
      if (name === 'bufferSubData' && (offset > 0 || length > 0)) return (length > 0 ? length : arg.byteLength / size - offset) * size;
      return arg.byteLength;
    }
    return 0;
  };
  for (const name of ['bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'texSubImage3D', 'compressedTexSubImage3D']) {
    wrap(proto, name, args => {
      const bytes = bytesOf(args, name);
      current.uploadBytes += bytes;
      if (name.startsWith('buffer')) current.bufferUploadBytes += bytes;
    });
  }
  wrap(proto, 'linkProgram', (args, context) => {
    current.programLinks++;
    if (!state.recording) return;
    state.programLinks++;
    state.linkNames.push({frame: state.frames.length, pass, name: programName(context, args[0])});
  });

  const nativeFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => nativeFrame(now => {
    if (stepMs > 0 && now !== lastNative) { lastNative = now; virtual += stepMs; }
    const started = performance.now();
    inFrame = true; pass = 'script'; spanStart = started;
    try { callback(stepMs > 0 ? virtual : now); } finally {
      closeFace(); enter('script'); inFrame = false;
      current.callbackMs += performance.now() - started;
    }
  });
  // The interval is real time between the starts of two frames' callbacks: the animation-frame timestamp is the frame's planned
  // begin, which snaps to 60 Hz slots, so a frame that starts late read a whole slot long and the next one a slot short.
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    collectTimings();
    if (state.recording) state.frames.push({intervalMs: now - last, ...current});
    current = fresh();
    last = now;
    nativeFrame(tick);
  };
  nativeFrame(tick);
}
