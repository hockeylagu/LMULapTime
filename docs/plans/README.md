# Plans and remaining work

General review: 2026-10-10; replay storage/ingestion entries updated and type refactoring archived 2026-10-12. This is the entry point for delivery status;
[CODE_MAP.md](../CODE_MAP.md) describes the implementation. A proposal is not a shipped feature.

## Active work

| Plan | Status | Next useful step | Completion gate |
|---|---|---|---|
| [Replay storage and ingestion design](REPLAY_STORAGE_DESIGN.md) | Proposed; [initial POC](REPLAY_STORAGE_POC.md) complete; both candidates rejected on size | Evaluate storage reductions against current compact lap format | Storage size first, app read response second, ingestion third; archived-data safety and domain parity required |
| [Corner comparison rework](CORNER_COMPARISON_REWORK.md) | In progress on `corner-map`; not integrated into main | Read the worktree's hybrid handoff; complete M2 metric/sequence revalidation, then M3 inspector acceptance | Accepted shared action maps, independent events, swap symmetry and additive timing; visual/sequence gates and consumer integration verified before merging |
| [Simplified 3D replay and camera controls](REPLAY_3D_PLAN.md) | Proposed; source analysis reviewed 2026-10-15 | Validate one exported plugin scene against cached replay poses | Simplified track, cars, cameras and comparison stay aligned with telemetry; layout/revision isolation, fallback and performance gates pass |
| [Live race dashboard](LIVE_RACE_DASHBOARD.md) | Built on `live-dashboard` 2026-10-16 (practice, qualifying, race plan, damage, garage checklist, wetness); reviewed for the merge to main | Race-weekend validation: race plan, fuel-class MFD line, race-garage tyre read, wet track, online forecast, readability from the seat | One passive page readable at 50+ inches on 27-inch 1440p; deterministic pit advice, full-width pedal trace and honest damage estimates |

The main corner engine still derives windows from the primary lap's speed trace. The separate
`corner-map` worktree already implements geometry/class profiles, maps, measurements and several
metric phases, plus six accepted hybrid maps and an opt-in timing/event adapter. Coaching, progress,
quick references, shared consumer migration and final UI acceptance remain incomplete. Its handoff
is authoritative for continuation; the main plan now distinguishes that branch work from shipped code.
Do not restart completed phases or infer that implemented metrics have passed their user visual gates.

Worktree inventory at review (main rechecked 2026-10-12): main at `25d1e988`, `corner-map` at `9a11f3fa`, and
`debrief-first` at `80f8c56a`. The latter also has uncommitted debrief changes; its integration
status and overlap with current main were not assessed. Preserve that work and review its
behavior before deciding whether anything still needs porting. No worktree was merged or archived.

## Remaining work, in recommended order

These are follow-ups, not authorization to change application behavior. Each needs a focused change
with its own verification. Historical timings below identify candidates; remeasure before optimizing.

| Order | Work | Evidence / entry point | Done when |
|---|---|---|---|
| 1 | Reconcile multiclass rank, classification sorting and gain | `src/components/session-detail/standings/SessionRaceStandings.tsx`, `SessionRaceStandingsRow.tsx` | The chosen class/overall meaning is explicit and a regression covers differing class and overall gains, including unknown values |
| 2 | Validate keyboard, focus and Escape in session detail and fullscreen map | `src/components/session-detail/standings/SessionRulesModal.tsx`, `src/components/replay/map/useMapFullscreenFocus.ts`, `src/components/replay/ReplayShortcutHelp.tsx` | Real recordings pass keyboard navigation, focus containment/restoration and nested Escape checks at the normal desktop viewport; record evidence |
| 3 | Continue and validate the corner-map branch | [Current branch/main status](CORNER_COMPARISON_REWORK.md#current-implementation-review--2026-10-10) and its worktree handoff | Complete M2/M3 and the remaining visual/consumer gates; verify compatibility with newer main storage before integration |
| 4 | Profile and improve comparison candidate queries | [Archived summary measurements](archive/PERSISTED_SESSION_SUMMARIES.md#implementation-verification), [normalized storage results](archive/NORMALIZED_SESSION_STORAGE.md#status-of-phase-2); `server/core/sessionSummaries/comparisonQueries.ts` | Repeatable before/after measurements and query plans show less broad count/best-lap work while preserving deterministic results and bounded hydration |
| 5 | Review class identity rules | `shared/domain/lapPlaces.ts`; progression contract consolidation is [completed](archive/SRC_SIMPLIFICATION_AUDIT.md) | Class grouping follows canonical resolution with parity tests |
| 6 | Measure remaining startup and telemetry preparation costs | [Cache audit](../SERVER_CACHE_AUDIT.md); package validation and telemetry preparation | Separate cold/warm startup, package validation and trajectory preparation measurements identify a concrete bottleneck before changing retention or loading |

200% browser zoom validation is deferred by user decision on 2026-10-10; it is not required to complete item 2.

The fullscreen turn selector was removed by user request. Keyboard panning remains; restoring that
selector is not a pending task. A keyboard corner-navigation alternative requires a separate design decision.
Pit repair inference remains a known data limitation, pending trustworthy recorded or REST evidence.
Idea, not planned: a live capture could enrich the telemetry channels (measured yaw rate and slip,
per-tyre slip, damage zones, rain, repair time); see [TELEMETRY_FORMAT.md](../TELEMETRY_FORMAT.md#possible-enrichment-from-a-live-capture-idea-not-planned).
File and folder size limits are ongoing checks; split only along meaningful responsibilities.

## Completed plans

| Record | Outcome | Historical completion |
|---|---|---|
| [Dropdown standardization](archive/DROPDOWN_STANDARDIZATION.md) | All 24 inventoried dropdowns and disclosures on one shared family (`common/dropdown/`): custom select-only `Select` replaces every native select; keyboard, typeahead, Escape layering and modal/fullscreen placement verified; tests/build clean | 2026-10-13 |
| [Type refactoring](archive/TYPE_REFACTORING_PLAN.md) | One canonical type per model, one name and one place per fact in TypeScript, SQL and stored JSON; cache rewritten offline; follow-up fixes for driver selection, canonical package classes and server-side compare picker, chart history and Compare page bests | 2026-10-12 |
| [Frontend simplification audit](archive/SRC_SIMPLIFICATION_AUDIT.md) | Ten fixes committed separately: direct imports, shared wheel rendering and modal focus, canonical progression type, fewer repeated calculations and requests, and removed forwarders; full tests/build passed | 2026-10-12 |
| [Shared domain cleanup](archive/SHARED_DOMAIN_CLEANUP.md) | Eight audit findings fixed by Luna; independent review, 1,500-case parity, full tests/build and matching-dataset endpoint benchmarks passed | 2026-10-11 |
| [Session reload recovery](archive/SESSION_RELOAD_RECOVERY.md) | Multiplayer player selection fixed; offline repair restored 739 sessions and canonicalized 132 benchmark entries while preserving retained data | 2026-10-11 |
| [Exact identity matching cleanup](archive/EXACT_IDENTITY_MATCHING_CLEANUP.md) | Exact session IDs/types/layouts/drivers, versioned retained ownership reconciliation; full tests/build/coverage and same-dataset benchmark validated | 2026-10-11 |
| [Replay cache normalization](archive/REPLAY_CACHE_NORMALIZATION.md) | Normalized replay facts/events/laps and completed cache migration; lap conditions also shipped | 2026-09-27; conditions follow-up 2026-09-28 |
| [Smells cleanup](archive/SMELLS_CLEANUP.md) | Correctness fixes, domain extraction, module/component splits; optional folder splits deferred where no semantic grouping was clear | 2026-09-29 |
| [Persisted session summaries](archive/PERSISTED_SESSION_SUMMARIES.md) | Compact server pages, SQL aggregates, session-based telemetry identity and bounded summary rebuilds | 2026-10-10 |
| [Normalized session storage](archive/NORMALIZED_SESSION_STORAGE.md) | Normalized rows are authoritative; legacy JSON and temporary conversion code removed | 2026-10-10 |

Archive files preserve design decisions, migration evidence and measurements from their delivery date.
Their branch names, step instructions, old paths, schemas and test totals are historical, not current runbooks.
Do not rerun completed migrations from these documents. Later changes are described in CODE_MAP.

## Maintenance rules

- Keep one active plan per substantial change. Start it with status, review date, scope, dependencies,
  next step and observable acceptance criteria. Use `Proposed`, `In progress`, `Blocked` (with a reason),
  `Completed` or `Superseded`; do not infer completion from a branch name or a checklist alone.
- On completion, record the outcome and remaining work, move the plan into `archive/`, update this
  index and repair inbound links in the same change. Preserve evidence rather than deleting the plan.
- Keep operational guidance in current reference docs. Label old measurements and audit findings
  with their dates; mark resolved findings without erasing their original evidence.
- Check claims against source, commands against `package.json`, relative links against the filesystem,
  and relevant tests/builds. Distinguish source review, automated checks and live game/browser validation.
- Refresh only measurements actually rerun. Private fixtures, live LMU APIs, coverage and browser
  behavior must never be represented as freshly validated by an ordinary source review.
