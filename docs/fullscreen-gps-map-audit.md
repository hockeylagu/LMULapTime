# Fullscreen GPS map technical audit

Date: 2026-10-07. Scope: current working-tree fullscreen replay map and its controls, HUD, minimap, corner markers, shortcut help and friction circle. Existing uncommitted map changes were included and preserved.

## Hardening follow-up — 2026-10-07

The original findings and 11/20 score below describe the pre-hardening snapshot. Findings **1, 2, 3, 4, 6 and 10** are addressed in this pass: fullscreen now isolates the background and contains/restores focus, locks page scrolling, supports a native turn selector and W/A/S/D camera pan, and lets nested shortcut help consume Escape first. Missing/non-finite HUD channels remain unavailable; neutral/reverse gears are preserved, limiter speed is no longer assumed, and off-road status no longer claims a penalty. The friction plot does not infer grip from absent acceleration, respects explicitly unavailable aligned baselines, and breaks its trail at missing samples. Secondary control states and focus treatment were added. The constrained desktop mode bar moves below navigation to prevent the overlap seen at 1280px.

Verification: production build passed without warnings. Full suite passed **268 files / 2368 tests**, with **5 files / 56 tests skipped**, after rerunning outside the sandbox for localhost connections and temporary-cache access. A browser preview using synthetic data verified nested Escape/focus and fullscreen presentation at 2560×1440 and 1280×720; this does not validate personal track geometry or replay ingestion. Findings **5, 7, 8**, plus broader HUD/menu/friction layout work in **9**, remain for clarify/typeset/adapt/polish. The bundled detector remains unavailable. New regression tests cover missing/non-finite channels, recorded gear states, real zero readings, focus/scroll restoration, nested Escape, native turn selection, fullscreen scrub/pan and manual camera persistence.

## Typesetting follow-up — 2026-10-07

Finding **8** is addressed. HUD captions, identity and TC/ABS badges now meet the 10px floor; primary numbers use 14px tabular readouts. Assist badges sit beneath pedal values with reserved caption height. Steering gets enough column width for full-lock readings while the overall HUD widths remain unchanged. APEX text is 10px with a larger supporting pill, and hover annotations meet the same floor. SVG readouts consistently use the established Consolas family; no font assets were added.

Verification: synthetic browser previews at **1280×720 and 2560×1440** showed no audited HUD text below 10px and no overflowing readout cells, including 100% pedals, full steering lock and both assist indicators. Expanded and collapsed presentation were checked. The smaller viewport exercises reduced desktop space, rather than claiming a browser-zoom test. Focused map tests passed **25 files / 223 tests**; the full suite passed **268 files / 2368 tests**, with **5 files / 56 tests skipped**, and the production build passed without warnings. The typography detector remains unavailable because its engine is absent. Findings **5 and 7**, and broader layout work in **9**, remain follow-ups. The original score below is historical and has not been recalculated.

## Copy clarification follow-up — 2026-10-07

Finding **5** is addressed. Both map control surfaces and the fullscreen HUD use **Primary / Baseline**, without assuming player ownership or a pinned rival. Tooltips define the primary as the inspected lap and baseline as the comparison reference. Line controls announce **Fade / Restore primary or baseline line**. Delta captions say **ahead / behind / even**, describing the time difference rather than suggesting a changing rate of gain. Help explains the sign and distance alignment, and distinguishes racing-line separation from a race gap. Status help distinguishes car location, limiter and weather from race-control flags; the unsupported “green” caption is replaced by a labeled air temperature or `air --`. Collapse/expand tooltips match the accessible control names.

The comparison identity column grows from 46px to 60px and the total HUD from 600px to 614px so both full labels fit at the existing 10px floor. Synthetic browser checks at **1280×720 and 2560×1440** found no overflowing readout cells; fade/restore names and collapsed/expanded summaries were verified. Focused map tests passed **25 files / 223 tests**. The full suite passed **268 files / 2368 tests**, with **5 files / 56 tests skipped**, and the production build passed without warnings. This pass adds no driver or telemetry-source claims unsupported by the map's inputs. Findings **7** and broader layout work in **9** remain for polish/adapt; the original score is historical.

## Polish follow-up — 2026-10-07

Finding **7** is addressed. HUD, mode, navigation, fullscreen and friction controls use the existing semantic surface/text/signal tokens. HUD headers and ordinary mode icons are neutral; delta, trace identity and active TC/ABS retain meaningful color. Overlay rules and hover surfaces share the same vocabulary, and mode controls use color transitions rather than unrestricted transitions. Shortcut help uses the shared red `FOCUS_RING` and a 28px trigger consistent with map navigation. Friction axis labels are 12 SVG units (about 10.9px at the 116px plot size), use the readable marker text token, and its comparison row now says Primary consistently.

A synthetic preview found a small HUD/friction collision at 1280px. The friction panel now moves above the HUD below 1536px, leaving **23px** between them at 1280×720; at 2560×1440 it retains its lower-right position. The layers menu has a viewport-relative height limit and internal scrolling. These address the observed panel collision and menu bounding in finding **9**; a broader layout redesign and complete zoom/real-recording validation remain outside this pass.

Verification: browser DOM checks at **1280×720 and 2560×1440** confirmed no overflowing HUD readout cells, separate HUD/friction bounds, scrollable menu styling, shortcut Escape/focus restoration and a **2px red** keyboard outline. Token contrast calculations give **5.10:1** for muted text on the raised surface, **11.54:1** for TC and **9.07:1** for ABS; these are checks of those pairs, not a full map contrast certification. Focused map/help tests passed **26 files / 224 tests**; the full suite passed **268 files / 2368 tests**, with **5 files / 56 tests skipped**, and the production build passed without warnings. Automated detector validation remains unavailable because its bundled engine is absent. The original audit score is historical.

## Fullscreen turn selector removal — 2026-10-08

Removed the fullscreen toolbar's turn selector at the user's request after they reported that selecting a turn exits fullscreen. The toolbar no longer accepts turn-selection props or invokes the parent corner-selection callback. Existing map corner markers remain. The native selector no longer provides the keyboard corner-selection alternative described in finding **2**; W/A/S/D camera pan remains available. Earlier follow-ups describe the implementation at their respective dates.

## Fused telemetry status repair — 2026-10-08

The user reported ON TRACK at the first fullscreen frame and UNKNOWN later, with a screenshot showing UNKNOWN during the lap. `telemetryFusion.ts` copied DuckDB samples and VCR coordinates without transferring replay-only status or weather fields. Timing-line interpolation can restore channels from the VCR edge recording on the boundary point, explaining the inconsistent first-frame behavior. Fusion now keeps native status/weather values when present and otherwise uses the current recorded VCR frame; discrete states change at exact frame boundaries rather than being blended or taken early from a future frame. Recorded false flags and zero weather values remain intact. Truly missing fields still remain unavailable.

Regression tests cover the full lap timeline, frame transitions, native-value precedence and missing data. Fusion runs on each trajectory request, so no stored-cache invalidation or replay reparse is needed; an already-loaded lap must be fetched again to receive the repaired points. The normal inspector HUD's permissive ON TRACK fallback remains separate from the stricter fullscreen display.

## HUD header color preference — 2026-10-08

Restored the user's preferred colored HUD column headers for faster scanning: sky speed, green throttle, red brake, indigo steering, amber G-force/delta, cyan line separation and purple status. The colors use existing `lmu-*` tokens; typography, accurate comparison labels and status handling remain intact. This overrides the neutral-header choice in the earlier polish follow-up.

## Implementation integrity verdict

**Fail pending corrections.** The map has a coherent racing-specific architecture: layout-specific geometry, independent vehicle footprints, distance-aligned comparison, recorded-channel interpolation and shared map colors. However, the fullscreen HUD fabricates values when optional channels are absent, assumes a pit speed, clamps recorded gears and describes every comparison as a rival. Those behaviors conflict with PRODUCT.md's requirement that numbers and identity be correct or explicitly unavailable.

The bundled detector could not run: engine 0.1.5 is absent and its default cache is not writable in this session. Findings below are manually verified; none are represented as detector output.

## Executive summary

**Provisional health score: 11/20 — Acceptable, significant work needed.** Ten findings: P0: 0; P1: 3; P2: 7; P3: 0. Address fullscreen focus isolation, keyboard corner selection and misleading telemetry first.

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 2/4 | Main buttons have names and focus rings, but fullscreen does not isolate focus and corner controls are pointer-only. |
| Performance | 3/4 | Memoized geometry, grouped paths, stable hit-test callbacks and view culling; frame time and compositor cost were not measured. |
| Responsive design | 2/4 | Fullscreen fills the viewport, but independently anchored controls have no collision strategy and HUD grids retain fixed columns. |
| Theming | 2/4 | Shared geometry colors exist; fullscreen HUD, mode bar and friction panel repeatedly bypass semantic tokens. |
| Implementation integrity | 2/4 | Strong domain-specific implementation with several verified presentation/data-truth failures. |
| **Total** | **11/20** | **Provisional source-level assessment, not WCAG certification.** |

## Evidence and limits

- `npx vitest run test/components/replay/map test/components/replay/ReplayShortcutHelp.test.tsx`: **26 files / 210 tests passed**, no warnings in output.
- A separate React/jsdom interaction probe reproduced focus moving outside the expanded map. With shortcut help open, one Escape removed both help and fullscreen state.
- React server-render probes confirmed missing channels render `0 km/h`, `GEAR 1`, zero pedals/steering/G, and `ON TRACK / green`. Gear 0 and -1 both rendered `GEAR 1`. Enabling the limiter rendered `60 km/h` without speed-limit data. Missing G channels in the friction panel rendered `0% RESERVE / Grip available`.
- The local UI at `http://localhost:5173` returned `ERR_CONNECTION_REFUSED`. No committed fullscreen screenshot fixture was found. The existing telemetry-studio screenshot is not a fullscreen regression fixture. Rendered overlap, text contrast, browser zoom behavior, screen-reader output and playback frame rate remain unverified.
- PRODUCT.md targets large desktop displays, not phones/tablets. Narrow-width observations below concern reduced desktop windows and browser zoom; a mobile redesign is not recommended.
- No production code changed. This report and its code-map reference are the only audit edits. Full build/all-suite validation was not necessary for documentation-only changes.

## Detailed findings

### 1. [P1] Fullscreen leaves the background focusable

**Location:** `src/components/replay/map/scene/GpsTrackMapScene.tsx:209`; `src/components/replay/map/display/MapFullscreenButton.tsx:23`.

**Category:** Accessibility.

Expansion sets a CSS attribute and window Escape listener. It has no dialog semantics, background inertness, focus containment, entry focus management or scroll locking. The interaction probe successfully focused a button outside the expanded map. Keyboard users can operate controls visually hidden behind it, and assistive technology has no declared modal boundary.

**Standard:** [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). This is a verified isolation defect, not a claim that every fullscreen region must be a dialog.

**Recommendation:** Give this covering overlay a named modal boundary, isolate background controls, contain focus, lock background scrolling and restore the trigger when it closes. The existing body-portal `useModalFocus` hook provides these mechanics; adapt its contract carefully for the nested shortcut dialog.

**Suggested command:** `$impeccable harden`.

### 2. [P1] Corner selection and free camera panning lack keyboard equivalents inside fullscreen

**Location:** `src/components/replay/map/scene/GpsSceneMarkers.tsx:147` and `:174`; `src/components/replay/map/GpsCircuitMinimap.tsx:77`; `src/components/replay/map/useGpsMapShortcuts.ts:96`.

**Category:** Accessibility.

Corner/apex groups only expose click handlers: no focusability, button role, accessible name, selected state or Enter/Space activation. The minimap only accepts pointer positioning, and arrow shortcuts scrub samples rather than pan the camera. The corner picker outside the covering overlay cannot serve as its visible keyboard alternative. Keyboard users can scrub/zoom/follow, but cannot directly select a named turn or freely inspect an arbitrary part of the circuit within fullscreen.

**Standard:** [WCAG 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), and name/role requirements for interactive markers.

**Recommendation:** Add accessible corner selection within fullscreen (a compact native selector is sufficient), with selected state and focus feedback. Provide a separate documented keyboard pan action that preserves existing scrub shortcuts. Interactive SVG markers may additionally expose appropriate button semantics.

**Suggested command:** `$impeccable harden`.

### 3. [P1] HUD presents absent or transformed data as recorded facts

**Location:** `src/components/replay/map/display/GpsMapTelemetryHud.tsx:14`, `:22`, `:58`; `src/components/replay/map/ReplayFrictionCircle.tsx:22`.

**Category:** Implementation integrity.

Optional channels become zero speed/pedals/steering/G, missing gear becomes first gear, and unknown track status becomes `ON TRACK / green`. Recorded neutral/reverse are also clamped to first gear. The limiter subtext assumes `60 km/h` from a boolean alone. The friction panel interprets missing acceleration as `0% RESERVE / Grip available`. These outputs can change the driver's interpretation of the lap even though the underlying channel or limit was never supplied.

**Standard:** PRODUCT.md's exact-numbers, explicit-unknowns and trust-over-coverage rules; no specific WCAG criterion asserted.

**Recommendation:** Preserve channel availability through expanded/collapsed HUD and friction panel. Show `—`/Unavailable for absent channels, retain neutral/reverse and recorded gear range, label unknown status honestly, and show a speed limit only when sourced. Suppress grip conclusions when the required channels are absent. Add meaningful missing-channel and gear/status regression cases.

**Suggested command:** `$impeccable harden`.

### 4. [P2] Escape closes shortcut help and the fullscreen map together

**Location:** `src/components/replay/map/display/MapFullscreenButton.tsx:28`; `src/components/replay/ReplayShortcutHelp.tsx:40`.

**Category:** Implementation integrity / Accessibility.

The help dialog prevents default for Escape but does not stop propagation. The map's window listener checks neither `defaultPrevented` nor the active overlay. The interaction probe confirmed that one Escape closes both layers. A driver checking shortcuts loses their expanded workspace when dismissing help.

**Standard:** Nested-overlay interaction convention; no specific WCAG failure asserted.

**Recommendation:** Let the topmost overlay consume Escape, and make the map listener respect consumed events/active dialogs. Verify that a first Escape closes help and a second exits fullscreen. Preserve the layer-menu handler's existing event isolation.

**Suggested command:** `$impeccable harden`.

### 5. [P2] Comparison labels assume player-versus-rival identity

**Location:** `src/components/replay/map/display/GpsMapTelemetryHud.tsx:251` and `:267`; `src/components/replay/map/display/GpsMapModeBar.tsx:139`.

**Category:** Implementation integrity / UX copy.

The HUD only receives points and deltas, yet hard-codes `ME` and `RIVAL`; the mode bar labels the primary line `Mine`. The studio supports inspecting another driver and comparing the player's own laps. A baseline is not necessarily the board's pinned rival, and the inspected primary is not always the player. These labels misidentify the traces.

**Standard:** Product identity correctness; no specific WCAG criterion asserted.

**Recommendation:** Use Primary/Baseline by default. Pass selected-driver/lap identity explicitly if more specific labels are needed, and reserve Rival for an actual rival selection.

**Suggested command:** `$impeccable clarify`.

### 6. [P2] Line-fade toggles do not expose their state

**Location:** `src/components/replay/map/display/GpsMapModeBar.tsx:127` and `:143`; `src/components/replay/map/display/GpsMapTelemetryHud.tsx:277`.

**Category:** Accessibility.

Mine/Baseline fade buttons change visual treatment and titles but have no `aria-pressed` state. The HUD collapse button changes its accessible name, but does not expose `aria-expanded` or identify the controlled content. Screen-reader users cannot inspect the fade state as they can for the neighboring mode/G-force/friction toggles.

**Standard:** [WCAG 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html) for programmatically available control states.

**Recommendation:** Set `aria-pressed` from `fadedLine` with unambiguous action names. Give the HUD content a stable ID and expose `aria-expanded`/`aria-controls` on its collapse control.

**Suggested command:** `$impeccable harden`.

### 7. [P2] Fullscreen overlays bypass the established color roles

**Location:** `src/components/replay/map/display/GpsMapTelemetryHud.tsx:43` and `:232`; `src/components/replay/map/display/GpsMapModeBar.tsx:45` and `:97`; `src/components/replay/map/ReplayFrictionCircle.tsx:200`; `src/components/replay/map/display/MapLayersControl.tsx:77`.

**Category:** Theming.

HUD rows/captions and icon colors use raw slate/sky/emerald/rose/indigo/amber/purple classes alongside semantic roles. Overlay backgrounds also use raw slate. Future tuning of the documented palette will leave these fullscreen readouts behind, and contrast improvements made to shared tokens will not reach them.

**Standard:** DESIGN.md's single-color-vocabulary rule. No computed contrast failure is claimed.

**Recommendation:** Replace raw classes with the existing `lmu-*` signal, data and neutral tokens. Keep map/SVG palettes in `themeColors.ts`. Blur on these overlays is allowed by the documented design system and is not itself a finding.

**Suggested command:** `$impeccable polish`.

### 8. [P2] Important readout annotations violate the 10px type floor

**Location:** `src/components/replay/map/display/GpsMapTelemetryHud.tsx:130`, `:147`, `:251`, `:266`; `src/components/replay/map/scene/GpsSceneMarkers.tsx:166` and `:210`.

**Category:** Accessibility / Implementation integrity.

TC/ABS badges use 8px type, identity badges remain 9.5px even above the small breakpoint, and APEX labels use 7.5 SVG units with marker scaling intended to hold screen size. These are meaningful annotations the driver must distinguish while reading traces, not expendable decoration.

**Standard:** DESIGN.md's 10px minimum; font size alone is not asserted as a WCAG failure.

**Recommendation:** Bring badge/marker text to at least the documented floor and budget enough width for assists/identity. Verify at the shipped desktop dimensions and 200% browser zoom.

**Suggested command:** `$impeccable typeset`.

### 9. [P2] Independent overlay anchors cannot accommodate reduced desktop space

**Location:** `src/components/replay/map/display/GpsMapModeBar.tsx:45`; `src/components/replay/map/display/GpsMapControls.tsx:38`; `src/components/replay/map/display/GpsMapTelemetryHud.tsx:188`; `src/components/replay/map/scene/GpsTrackMapScene.tsx:293`; `src/components/replay/map/display/MapLayersControl.tsx:59`.

**Category:** Responsive design.

The top-centered mode bar and top-right navigation share the same vertical band, with neither wrapping nor a shared layout. HUD columns total 572px in compare mode, plus the 24px collapse control; its outer max-width shrinks without changing those columns. The lower-right friction panel has no collision relationship with the centered HUD. The layers menu has no viewport-relative max-height/scroll region. This structure has no way to handle narrowed/zoomed desktop space, though actual overlap has not been measured in a browser.

**Standard:** Desktop zoom/resizing resilience; no rendered WCAG reflow failure is asserted. Mobile support is outside PRODUCT.md's target.

**Recommendation:** Allocate shared top/bottom overlay regions that reserve space for their neighbors; use wrapping or an intentional compact state under constrained desktop widths. Make expanded HUD content scroll or switch structure before its fixed columns exceed available space, and bound the layer menu's height. Verify at 2560×1440 and the effective desktop viewport at 200% browser zoom.

**Suggested command:** `$impeccable adapt`.

### 10. [P2] Secondary overlay controls lack the shared focus treatment and have small hit areas

**Location:** `src/components/replay/map/display/GpsMapTelemetryHud.tsx:282`; `src/components/replay/map/ReplayFrictionCircle.tsx:178`; `src/components/replay/ReplayShortcutHelp.tsx:36`.

**Category:** Accessibility / Responsive design.

The HUD collapse control and friction close control omit the shared `FOCUS_RING`, relying on browser defaults. The friction close button contains a 14px icon with 2px padding per side (18px footprint). Navigation controls are mostly 28px square and shortcut help is 24px square. The isolated friction close button is especially hard to acquire precisely. Rendered browser focus and spacing exceptions were not measured, so this is not a categorical WCAG target-size failure.

**Standard:** DESIGN.md's visible-focus treatment and Impeccable's 44px touch-target audit guideline; desktop density is an explicit product constraint.

**Recommendation:** Add the established focus treatment to both controls and enlarge the friction close hit area without enlarging its icon. Keep desktop density, but provide larger coarse-pointer hit areas where relevant.

**Suggested command:** `$impeccable harden`.

## Patterns and positive findings

Presentation correctness is the largest recurring issue: absent channels, assumed states and assumed driver identity all read as facts. Overlay lifecycle is split across multiple window listeners instead of a coordinated stack. Shared design roles and accessibility states are applied to primary controls but inconsistently to secondary controls.

Preserve the grouped heatmap runs and wide transparent hit paths; these avoid per-sample DOM targets. Keep stable hover callbacks, memoized static layers and buffered culling. Retain native labeled layer checkboxes, announced display errors, focus rings on most buttons, pressed states on mode/follow/G-force controls, and suppression of replay shortcuts in editable controls and dialogs. Keep baseline dashed lines as a non-color distinction and the clearly named estimated friction plot. The missing-trajectory message and geometry fallbacks provide useful partial-data behavior.

The global reduced-motion rule preserves an informative slower spinner while disabling decorative transitions. No always-on decorative map loop was found. No light-theme support, mobile redesign or replacement of the existing motorsport visual identity is needed.

## Recommended actions

1. **[P1] `$impeccable harden`** — Correct missing-channel/gear/status output; implement fullscreen focus/scroll isolation, keyboard corner/pan access, nested Escape behavior and control states.
2. **[P2] `$impeccable clarify`** — Use accurate Primary/Baseline identity and source-specific labels.
3. **[P2] `$impeccable adapt`** — Resolve overlay allocation, constrained desktop HUD widths and layer-menu height.
4. **[P2] `$impeccable typeset`** — Bring assist/identity/apex annotations to the established type floor.
5. **[P2] `$impeccable polish`** — Normalize semantic colors and focus treatment, then perform one batched desktop visual confirmation.

You can ask me to run these one at a time, all at once, or in any order you prefer. Re-run `$impeccable audit` after fixes to see your score improve.
