# Frontend duplication and repeated-work audit

Reviewed 2026-10-12. Scope: `src/`, with test/tool import updates where needed.
Status: **Completed** on 2026-10-12. All ten selected fixes are committed and validated.
Archived as delivery evidence; file counts and test totals below describe that validation snapshot.
Existing backend and Vite changes in the working tree were preserved.

## Overview scan

The starting tree contained 348 TypeScript files and approximately 41,200 lines.
The scan inventoried file/directory sizes, export chains, repeated source blocks,
collection scans, requests, cancellation, memoization, and shared-domain callers.
The deeper pass followed the candidate implementations and their callers; this
was a static review, not a browser performance profile or an exhaustive line-by-line audit.

- No TypeScript file exceeded 1,000 lines, no frontend component exceeded 300,
  and no directory exceeded 20 direct TypeScript files.
- Replay contains most of the frontend complexity: about 17,200 lines after cleanup.
  Its largest orchestration hook is `useReplayInspectorData.ts` (618 lines).
  The comparison selection hook, `useCompareLapsData.ts`, is 508 lines.
- Domain ownership is generally sound: circuit resolution, clean-lap selection,
  replay-lap classification, and pace calculations already use shared implementations.
- Main duplication was export plumbing, four-wheel rendering, modal lifecycle code,
  and a copied progression contract. Repeated computation was clearest in chart
  extrema and dashboard date sorting.

## Completed simplifications

| Finding | Change | Preserved behavior |
|---|---|---|
| 23 pass-through `index.ts` files, some chaining several feature directories | Removed them and resolved named imports directly to their defining modules in source, tests, and analysis tools | Existing names/aliases and route loading boundaries |
| Six wheel-channel SVG implementations | `channels/TelemetryWheelTrace.tsx` owns drawing of brake temperatures, ride height, wheel speeds, pressure, tire temperatures, and wear | Baseline-first drawing, corner colors, stroke attributes, memoization; channel scales, readouts, empty states remain local |
| Rules dialog copied `useModalFocus` | Calls the existing hook | Focus trap, Escape, trigger restoration, inert siblings, body scroll restoration |
| Chart progression interface copied shared session fields | Extends shared `SessionProgressionPoint` with the three chart-specific fields | Wet-best and benchmark presentation fields |
| `DashboardRoute` only forwarded props | Route renders `Dashboard` directly | Props and navigation |
| Sorting parsed dates inside every comparator invocation | Parse each session date once in the existing memoized calculation and reuse it for race selection | Sort tie-breakers and outing preference rules |
| Four-wheel extrema repeatedly scanned both laps and allocated channel arrays | One scan of each lap accumulates the bounds | Existing plausibility filters, padding, rounding, defaults, and primary-versus-baseline availability rules |
| Geometry and display fetched the same package twice | Associate the raw display payload with the validated geometry object in a WeakMap; reuse it during display loading | Object ownership follows the geometry cache lifetime; stale revision checks, parser errors, absent payloads, independent aborts, and standalone display fetches remain |
| Remaining named re-exports and phase-card barrel | Resolve consumers directly to definitions and remove forwarding exports plus `CornerPhaseCards.tsx` | Named symbols and domain implementations |
| `GpsTrackMap` only forwarded props to the scene | Call `GpsTrackMapScene` directly and remove the wrapper | Map props and scene behavior |

The extrema change also removes whole-lap argument spreads into `Math.min/max`.
Long full-resolution streams can exceed JavaScript's function argument limit;
only fixed four-element wheel tuples are now spread. Date parsing changes from
comparison-count work to one parse per session; extrema remain linear with fewer
passes and constant accumulator storage. No browser latency improvement is claimed.

The resulting tree has 324 TypeScript files, including the shared wheel renderer.
Most changed files contain only direct-import updates.

## Reviewed candidates retained by design

These candidates were reviewed and deliberately left separate. They are not incomplete
fixes or completion gates for this audit; revisit only with new requirements or evidence.

| Candidate | Evidence and decision |
|---|---|
| Large replay/comparison hooks | State transitions, URL locators, primary/baseline swapping, and retries are coupled. A generic fetching hook would hide those differences. Extract a selection/state model only with explicit transition tests, rather than splitting by line count. |
| Debrief and consistency lap loading | `loadSessionDebrief.ts` and `useCornerConsistency.ts` both load 400-point traces, but choose laps differently: debrief can admit traffic-flagged laps using per-corner traffic evidence; replay consistency uses replay clean-lap summaries and an explicit source. Share only an operation with identical inputs and failure semantics. |
| Single-value telemetry channels | Fuel, SoC and other scalar channels resemble each other, but vary in gradients, ranges, overlays and empty-state rules. Retain their current implementations rather than introduce a large configuration schema. The six wheel plots were an exact shared rendering case. |
| Dashboard car/circuit cards | Their sort/total/top-three selection repeats a few lines, while identities, actions and links differ. They already share `SummaryCard`, `UnitToggle`, `RankedList`, and `shareOf`; another abstraction currently adds more indirection than it removes. |
| Similar statistics | Lap and corner consistency use similar arithmetic with different eligibility, units, outputs, and insufficient-sample behavior. Do not merge their domain decisions merely to share variance arithmetic. |

No persistent trajectory cache, server/API behavior, parser classification, layout
matching, telemetry resolution, or benchmark formula was changed by this audit.

## Validation

- Production typecheck, Vite build, and local-data guard passed without warnings.
- Full tests passed outside the sandbox: 298 suites passed, 5 skipped;
  2,560 tests passed, 56 skipped, with no warnings. The sandbox attempt failed on Vitest
  temporary-module access and localhost endpoint connections.
- New extrema regressions cover absent channels, baseline-only ranges and primary
  availability, sensor boundary filtering, and a 150,000-sample stream.
- Existing channel, modal keyboard/focus, dashboard, progression, route, comparison,
  and golden telemetry tests remain the behavior checks for the refactors.
- A temporary parity check compared old/new extrema against 200 deterministic
  sensor datasets; all matched. The old implementation was not kept in production.
- Geometry API tests verify one request for geometry and display, absent payload reuse, stale revision suppression, malformed payload errors, and abort handling.
- No endpoint benchmark was needed: server request handling was unchanged.

## Separate fix commits

Each code fix has its own commit. Luna implemented the bounded geometry/display fix;
the primary agent reviewed it and ran the full validation.

| Commit | Fix |
|---|---|
| `1dcf086e` | Replace 23 frontend export barrels with direct imports |
| `2198b1b8` | Share six wheel-channel SVG renderers |
| `d895d6e7` | Reuse rules-dialog focus handling |
| `d32596ab` | Extend canonical progression type |
| `826432ca` | Remove dashboard route forwarder |
| `b6796026` | Parse dashboard dates once |
| `c4438447` | Accumulate wheel bounds without whole-lap argument spreads |
| `2bf4246b` | Reuse geometry-owned display payload |
| `0a3b1ad0` | Remove remaining named re-export shims |
| `629f67c1` | Remove GPS map forwarder |
