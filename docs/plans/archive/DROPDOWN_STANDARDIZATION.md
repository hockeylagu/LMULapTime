# Dropdown inventory and standardization plan

Status: Completed 2026-10-13 — shared custom Select chosen over native pickers; committed on main after driver review.
Reviewed: 2026-10-13.
Scope: Every native select and anchored dropdown-style surface in `src/`.
Dependencies: Existing `DESIGN.md`, semantic `lmu-*` tokens, shared button focus styles, and current fullscreen map controls.
Next step: Driver review of the open lists in the app.

## Goal and evidence

Make all dropdowns visibly belong to one component family without changing what they select, which records they compare, or how settings are saved.

This inventory comes from source inspection of native selects, dropdown components, `<details>` disclosures, popovers, and their consumers. It describes declared styles and implemented handlers, not a completed browser or accessibility audit. The earlier browser review covered the dashboard; other surfaces still need visual verification during implementation.

The working tree contains unrelated replay/map and design edits. Preserve them and recheck affected files before implementing this plan.

### Counts

| Category | Source definitions | Notes |
|---|---:|---|
| Native single-choice selects | 17 | Across 12 component files; the shared sort component is used on three pages. |
| Custom selection dropdowns | 3 | Lap inclusion, telemetry presets, fullscreen primary lap. |
| Other anchored panels/disclosures | 4 | Map layers, resolution/fidelity, replay Info, beaten rivals. |
| Total | 24 | Source definitions, not the number visible on one page. |

The three uses of the shared sort component make 19 native selector placements across the known page/components, before conditional rendering and component reuse. The baseline comparison trigger is also included below as a related control, but opens a modal rather than another dropdown.

## Native select inventory

Paths below are relative to the repository root. Each row is one source definition.

| ID | Surface / control | Source | Current appearance | Behavior and migration constraints |
|---|---|---|---|---|
| N01 | Dashboard, Tracks, track sessions: sort | [SortDropdown.tsx](../../../src/components/common/dropdown/SortDropdown.tsx) | 36px outer field; 12px corners; `lmu-bg`; border; sort icon and label; transparent native select | Preserve generic string option types and disabled options. Consumers: `DashboardFilterBar`, `TrackSummariesHeader`, `TrackSessionsToolbar`. |
| N02 | Dashboard: track filter | [DashboardFilterBar.tsx](../../../src/components/dashboard/DashboardFilterBar.tsx:79) | 36px, 300px-wide outer field; 12px corners; map icon; custom chevron; inner select hides native arrow | Chevron calls `showPicker()` with focus fallback. Preserve clear action and JSON venue/course option values so layouts never mix. |
| N03 | Session detail: driver | [SessionDetailHeader.tsx](../../../src/components/session-detail/overview/SessionDetailHeader.tsx:186) | 32px outer field; 8px corners; uppercase Driver label; transparent 14px semibold select | Preserve empty choice and driver ordinal conversion; provide an explicit accessible name. |
| N04 | Progression: track | [ImprovementHeader.tsx](../../../src/components/track-detail/improvement-chart/ImprovementHeader.tsx:38) | Standalone `lmu-bg` field; 12px corners; 14px text; 16px horizontal / 8px vertical padding | Hidden when header is embedded. Preserve track selection; add an explicit accessible name. |
| N05 | Progression: history range | [ImprovementChartControls.tsx](../../../src/components/track-detail/improvement-chart/ImprovementChartControls.tsx:40) | 12px-corner outer field; calendar icon and History label; transparent inner select | Preserve Session Count and Date Range optgroups and all range values. |
| N06 | Settings: AI model | [AISettingsCard.tsx](../../../src/components/settings/AISettingsCard.tsx:109) | Shared local `FIELD_CLASS`; 12px corners; 14px text; 256px width; 12px horizontal / 8px vertical padding | Keep label association, supported model values, and save flow. Do not restyle the API-key input incidentally when extracting select styling. |
| N07 | Settings: benchmark update version | [ReferenceLaptimesCard.tsx](../../../src/components/settings/ReferenceLaptimesCard.tsx:208) | 12px corners; `lmu-bg`; monospace 12px text; explicit red focus border | Conditional on open history and available versions. Keep Latest update, historical values, async feedback, and reset link. |
| N08 | Telemetry header: driver | [ReplayInspectorHeader.tsx](../../../src/components/replay/inspector/ReplayInspectorHeader.tsx:87) | 32px, 220px-wide outer field; 8px corners; icon/spinner; transparent select and custom chevron | Preserve loading, unavailable placeholder, disabled state, slot IDs, current driver title, and truncation. Avoid two chevrons after migration. |
| N09 | Telemetry header: lap | [ReplayInspectorHeader.tsx](../../../src/components/replay/inspector/ReplayInspectorHeader.tsx:119) | 12px-corner outer group; Lap label; previous/next buttons; transparent bold select | Preserve lap number/time, best/out-lap annotations, busy state, and adjacent lap navigation. |
| N10 | Telemetry header: playback speed | [ReplayInspectorHeader.tsx](../../../src/components/replay/inspector/ReplayInspectorHeader.tsx:245) | 32px; 8px corners; `lmu-card`; 11px monospace; border | Numeric speed conversion and existing available speeds must remain identical to fullscreen playback. |
| N11 | Baseline picker: car filter | [ReplayCompareLapPicker.tsx](../../../src/components/replay/inspector/compare/ReplayCompareLapPicker.tsx:130) | 6px corners; `lmu-bg`; bold 12px text; 190px maximum width | Preserve current-car annotation, All Cars, and exact filter values; currently uses an emoji annotation. |
| N12 | Baseline picker: session type filter | [ReplayCompareLapPicker.tsx](../../../src/components/replay/inspector/compare/ReplayCompareLapPicker.tsx:146) | 6px corners; `lmu-bg`; bold 12px text | Preserve All Types, practice/quali/race values and current-type annotation; currently uses emoji annotations. |
| N13 | Baseline picker: conditions filter | [ReplayCompareLapPicker.tsx](../../../src/components/replay/inspector/compare/ReplayCompareLapPicker.tsx:158) | Same 6px family; explicit red focus outline | Preserve same/all/dry/wet/dynamic-weather choices and matching-condition defaults. |
| N14 | Baseline picker: order | [ReplayCompareLapPicker.tsx](../../../src/components/replay/inspector/compare/ReplayCompareLapPicker.tsx:173) | Same 6px family; separate right-side control | Preserve Best Lap, Most recent, and Driver ordering. All four picker controls must work inside the modal focus boundary. |
| N15 | Fullscreen map: trace channel | [GpsMapTelemetryDock.tsx](../../../src/components/replay/map/telemetry/GpsMapTelemetryDock.tsx:86) | 28px; 192px wide; 4px corners; raised fill; 11px text | Preserve saved channel, combined pedals, conditional channels, and fallback when no baseline exists. |
| N16 | Fullscreen map: playback speed | [GpsMapPlaybackStrip.tsx](../../../src/components/replay/map/telemetry/GpsMapPlaybackStrip.tsx:23) | 28px; 4px corners; raised fill; 11px monospace | Conditional on playback context. Keep synchronized with N10 and preserve numeric conversion. |
| N17 | Steering trace: vertical scale | [TelemetrySteerOverlayToggles.tsx](../../../src/components/replay/telemetry/channels/inputs/TelemetrySteerOverlayToggles.tsx:26) | Content-sized; 4px corners; card fill; 10px muted monospace; minimal padding | Preserve Fit and fixed ±25/50/100% values. Must fit the compact trace title row; keyboard focus needs explicit verification. |

## Custom dropdown and anchored panel inventory

| ID | Surface / control | Source | Current appearance | Current behavior / work to preserve or verify |
|---|---|---|---|---|
| C01 | Consistency analysis: included laps | [LapSelectorDropdown.tsx](../../../src/components/replay/analysis/LapSelectorDropdown.tsx:22) | Small 8px-corner trigger; translucent card/border; 11px monospace; red hover border; 208px-wide card menu; large shadow | Checkbox multi-select stays open while editing. Outside mousedown closes. Preserve count, exclusions, invalid/non-representative badges and times. Add expanded/control association, Escape and focus return; keep checkboxes rather than forcing single-select behavior. |
| C02 | Telemetry: channel preset | [TelemetryPresetSelector.tsx](../../../src/components/replay/telemetry/presets/TelemetryPresetSelector.tsx:14) | Tiny unbordered 10px monospace trigger; 256px-wide `lmu-surface` menu; 12px corners; large shadow; white check; neutral selected fill | Outside mousedown closes; choosing a preset closes; Manage/Edit open editor. Preserve channel counts and management actions. Verify keyboard navigation, Escape and focus return; use semantics appropriate to the mixed actions. |
| C03 | Fullscreen map: primary lap | [GpsMapLapSelectors.tsx](../../../src/components/replay/map/display/GpsMapLapSelectors.tsx:10) | 32px trigger; 6px corners; translucent raised fill; 11px text; 256px-wide `lmu-strip` menu with 8px corners | Menu/menuitemradio semantics; selected-item focus; arrows/Home/End; Escape and selection restore trigger focus; outside pointer capture. Preserve busy/error/retry states and exact lap identity. |
| C04 | Map: Layers | [MapLayersControl.tsx](../../../src/components/replay/map/display/MapLayersControl.tsx) | 28px icon trigger; 8px corners; raised fill; 224px-wide card panel; 12px padding; shadow | Checkbox group with nested controls, availability states, runoff legend, fit/reset actions and optional pedal points. Preserve viewport height measurement, pointer capture, map-event isolation, first-input focus, blur/Escape dismissal and focus return. |
| C05 | Telemetry: resolution/fidelity | [TelemetryStripToolbar.tsx](../../../src/components/replay/telemetry/TelemetryStripToolbar.tsx:156), [TelemetryResolutionPopover.tsx](../../../src/components/replay/telemetry/TelemetryResolutionPopover.tsx:69) | Tiny unbordered monospace trigger; 320/384px-wide card panel; 12px corners; 16px padding; large shadow | Non-modal dialog with fidelity/source choices, sample statistics and close button. Outside mousedown closes. Verify trigger association, Escape and focus handling; retain current semantic source/fidelity colors and source availability. |
| C06 | Telemetry header: Info | [ReplayInspectorTitle.tsx](../../../src/components/replay/inspector/ReplayInspectorTitle.tsx:79) | Unbordered compact Info summary; 360px-wide card panel; 12px corners; 16px padding; smaller shadow | Native details disclosure with Escape/focus return. Keep metadata as read-only content; verify outside dismissal and viewport fit. |
| C07 | Leaderboard: beaten rivals | [RivalLadder.tsx](../../../src/components/leaderboard/rivals/RivalLadder.tsx:38) | Small green outlined summary; card list with 12px corners; 224px minimum width; 160px max height; shadow | Native details disclosure; historical list rather than selectable options. Preserve gain-colored measured times and beaten count; verify keyboard focus, dismissal and edge placement. This was missing from the preliminary summary. |

### Related control

`GpsMapLapSelectors.tsx` also renders **Change baseline lap / Compare**, with the same 32px trigger family as C03 and `aria-haspopup="dialog"`. It opens the baseline modal rather than a dropdown. Match its trigger styling while preserving dialog behavior, loading state and the adjacent remove-baseline action.

### Scope boundaries

Car-class/session-type pills, scope tabs, view toggles, inline expanding sections, tooltip readouts, toasts, dialogs, search fields and map mode buttons are not dropdowns. Keep them unchanged except where a dropdown shares their enclosing layout. The baseline modal's four actual selects remain in scope (N11–N14).

## Findings

1. Trigger heights vary between content-sized, 28px, 32px and 36px. Radius varies between 4px, 6px, 8px and 12px.
2. Trigger fills vary between transparent, background, card and raised tones. Open panels use card, surface or strip, with several shadow sizes and padding schemes.
3. Labels mix 10–14px text, several weights, and monospace for ordinary option names. Monospace should carry measurements and numeric values.
4. Some controls use browser arrows, some draw a Lucide chevron, and others have no directional cue. Wrapped selects create a risk of duplicate borders/arrows during migration.
5. Native selects have built-in keyboard/typeahead behavior. Custom controls have uneven focus/dismissal support; C03 and C04 already contain important map-specific handling that must survive consolidation.
6. A shared sort component exists, but other simple selects repeat styles. Shared styles must cover both native-style selection and the richer checkbox/information panels.
7. Styling only the closed native field will not guarantee identical open menus across browser engines. That implementation decision must be explicit.

## Proposed visual standard

One visual family, with two deliberate density sizes. These values are a proposal, not an implemented or approved design change.

| Element / state | Proposed standard |
|---|---|
| Trigger | `lmu-bg`, 1px `lmu-border`, 8px corners, 32px height, 10px horizontal padding |
| Compact trigger | Same surface, border, radius and states; 24px height only where the trace title row requires it |
| Trigger text | Segoe UI, 12px semibold; 11px in compact rows; monospace for times, speeds, deltas and numeric scale values |
| Chevron | One muted 14px Lucide ChevronDown; visible at narrow widths; decorative and hidden from assistive technology |
| Hover / open | Neutral raised/card emphasis; border moves to `lmu-rule`; red reserved for keyboard focus rather than hover |
| Keyboard focus | Existing 2px `lmu-accent-text` focus treatment; one visible outline for an entire compound field |
| Disabled / loading | `lmu-faint` text, disabled interactions; spinner and accessible busy state where loading already exists |
| Open panel | Opaque `lmu-card`, 1px `lmu-border`, 8px corners, one shared offset shadow, 4px anchor gap |
| Option row | At least 32px high; 10px horizontal padding; 12px text; neutral raised hover/selected fill |
| Selection indicator | White checkmark for a selected single option; native checkbox for multi-select; no selection conveyed by color alone |
| Panel spacing | 4px inset for option lists; shared larger content inset for informational/complex panels |
| Scrolling | Dark thin scrollbar, bounded height, selected option scrolled into view; panel stays inside its containing viewport |
| Motion | Existing `animate-pop-in`; reduced-motion behavior inherited from global rules |
| Semantic colors | Retain measured gains/losses, lap status badges, trace identity and documented resolution/source hues; neutralize only control chrome |

Use N08/C03's established 32px shape and C02's neutral selection treatment as the starting point. Keep C03 primary/baseline headers at 32px; assign compact density to the steering scale and small trace-toolbar controls. Align N10/N16 playback selectors on the same standard height unless the final visual pass identifies a real layout constraint.

## Implementation approach to review

- Extract shared trigger, option, panel, focus and density styles into the existing common UI system. Use defining modules directly, with no pass-through barrels or trivial wrappers.
- For fully uniform open single-choice menus, use one accessible shared Select implementation for N01–N17 and C03. It must support typed string/number values, disabled options, grouped options, long labels, refs/focus and loading states before migrating consumers.
- Retaining native selects is a lower-complexity alternative, but only promises uniform closed fields and browser-dependent open pickers. Do not silently describe that alternative as identical styling everywhere. Confirm the desired browser coverage when selecting the implementation.
- C01 and C04 remain checkbox/group interactions. C02 retains preset selection plus management actions. C05 remains a non-modal settings popover; C06/C07 remain informational disclosures. All share the same visual primitives without being assigned incorrect listbox/menu roles.
- Position overlays within the active fullscreen element or appropriate modal boundary. Avoid clipping by charts, scroll containers and map overlays; do not portal outside a modal's focus/inert boundary.
- Preserve existing option values, filtering, session/layout matching, telemetry persistence and settings save flows. Do not change backend or domain algorithms.

## Delivery sequence

- [x] Inventory native selects, shared consumers and custom anchored panels.
- [x] Record existing appearance, behavior constraints and omissions from the preliminary review.
- [x] Propose shared styling and document the native-versus-custom picker tradeoff.
- [x] Review/approve the visual standard and single-choice picker approach (shared custom Select, 2026-10-13).
- [x] Implement shared primitives and verify keyboard, focus, grouped/disabled options and overlay placement first.
- [x] Migrate N01–N07: page filters, progression and settings.
- [x] Migrate N08–N14: telemetry header and baseline modal filters.
- [x] Migrate N15–N17 and C03–C04: fullscreen/trace controls, preserving map event isolation.
- [x] Migrate C01–C02 and C05–C07: multi-select, presets, resolution and informational disclosures.
- [x] Remove obsolete local select styles and duplicated arrows; document the approved rules in `DESIGN.md`.
- [x] Complete the acceptance checks below and record results here.

## Acceptance checks

- Every inventory ID uses the approved family; only the documented compact density differs.
- Long circuit/car/driver names truncate safely without hiding chevrons, selected markers, lap numbers or remove actions. Group headings and option annotations remain readable.
- Single-choice controls support opening, arrows, Home/End, typeahead, Enter/Space selection, Escape, Tab, focus return and selected-item visibility. Multi-select toggles remain open and use checkbox semantics.
- Outside interaction dismisses applicable panels without interrupting the clicked control or triggering map pan/playback. Existing pointer-capture and modal-focus behavior remains correct.
- Empty, unavailable, loading, disabled and error states remain usable and accurately announced.
- Verify dashboard, Tracks, track detail/progression, session detail, settings, telemetry, the baseline picker, leaderboard rivals and fullscreen map at the supported desktop widths. No separate mobile redesign is proposed; `PRODUCT.md` targets desktop.
- Inspect a bounded batch of open/closed menu screenshots, including fullscreen and modal placement; fix findings together and confirm in one further pass.
- Reuse relevant existing suites: track toolbar/progression, AI/reference settings, inspector header/title/comparison picker, lap inclusion, telemetry presets/resolution, GPS lap selectors/layers/dock/playback. Add meaningful tests for new shared interaction behavior and uncovered regressions, not assertions that merely repeat CSS class strings.
- Run `npm test` and `npm run build`, both with zero warnings/errors. API benchmarks are unnecessary unless implementation unexpectedly changes API behavior/performance.
- Re-scan `src/` for native selects, custom menus and details disclosures to verify that all 24 definitions and the three shared sort consumers have been accounted for.

## Current outcome

Implemented 2026-10-13 on main; committed after driver review. Final pre-commit run: `npm test` 309 files, 2,653 passed, 56 skipped; `npm run build` clean.

- **Primitives** (`src/components/common/dropdown/`): `dropdownStyles.ts` (trigger, compact trigger, panel, option, group caption), `useAnchoredPanel.ts` (fixed-position placement that flips upward and stays in the viewport, host = open modal layer or body; `useOutsidePress` capture dismissal), `Select.tsx` (select-only combobox: arrows, Home/End, PageUp/PageDown, typeahead with a 500 ms buffer, Enter/Space, Escape without reaching the dialog or map layer, Tab closes; groups, disabled options, trailing mono detail, placeholder, busy state). `SortDropdown.tsx` moved here and now renders a `Select`.
- **N01–N17 and C03** use `Select`; no native `<select>` remains in `src/`. The dashboard track reset × is a sibling button beside the chevron (no nested buttons). Emoji annotations (N03 star, N11/N12) became text: "· You", "(Current)". The lap selector (N09) moved to square 32px previous/next buttons around the dropdown; lap options show "Lap N · Best/Out" with the time as a mono detail.
- **C01, C02, C04–C07** keep their semantics (checkbox group, preset buttons plus management actions, Layers group, non-modal resolution dialog, details disclosures) and share the styles. Added: Escape with focus return and `aria-expanded`/`aria-controls` (C01, C02, C05), outside dismissal for the disclosures (C06, C07), and dismissal moved from the resolution popover to its toolbar wrapper, so clicking the trigger to close no longer closes and immediately reopens it. C04 keeps its 28px icon trigger to match the map toolbar. After review, C05 (100Hz) and C06 (Info) went back to their quiet text-button triggers: they open popovers rather than lists, so they take no well or chevron; their panels keep the family style.
- **Found during browser verification:** a list mounted in normal flow inside the fullscreen map's flex column shifted the trigger before it was measured, so the trace channel list opened far from its trigger. The panel is now `fixed` from its first render.

Acceptance results:
- `npm test`: 309 files, 2,644 passed, 56 skipped, no warnings. New `test/components/common/dropdown/Select.test.tsx` covers keyboard movement, typeahead past disabled options, groups, pointer choice, Escape isolation and outside dismissal inside a modal host. Existing suites drive the shared control through `test/helpers/selectControl.ts`.
- `npm run build`: no warnings or errors.
- Browser (1600×1000, real data): dashboard track/sort, telemetry header (Info, driver, lap, speed), preset menu, steering scale (escapes the clipped trace row; keyboard choose and focus kept), fullscreen trace channel (opens upward inside the expanded map) and primary lap (selected lap scrolled into view), baseline modal car filter (inside the dialog, escapes the horizontal-scroll row). Escape layering: list, then dialog, then fullscreen. No console errors. Settings, progression, session detail driver, leaderboard rivals and lap inclusion were covered by tests, not by screenshots.
- Re-scan: no `<select>`/`<option>` in `src/`; the two remaining `<details>` are C06 and C07.

Decided 2026-10-13: the session search field stays 36px; the dropdowns in its filter rows (sort, dashboard track filter) take a third density, a 36px, 12px-radius trigger (`size="filter"`), so the row stays level.
