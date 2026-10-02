---
target: settings page (after reorganization)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\settings\\Settings.tsx"
target_fingerprint: "sha256:1496ed60f6190ede33da513a4507e297a94883cffed7de307ae31395c03369ef"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\settings\\Settings.tsx"
timestamp: 2026-10-02T02-16-52Z
slug: src-components-settings-settings-tsx
---
# Settings page critique, re-run after reorganization (f161c44, 2f0434f)

Method: dual-agent. Score 27/40 (Good), up from 22.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility | 3 | Idle replay upgrade shows nothing; pending/failed fetched but unrendered (ReplayCacheCard 51-62); "0 Cached" while loading |
| 2 | Real world | 3 | v3/v7, Trajectories, "~3 (5 shifts)" dropdown |
| 3 | User control | 2 | Upgrade On/Off removed in f161c44; hours-long job can't pause |
| 4 | Consistency | 3 | Button casing/shape drift; AI key removal window.confirm (AISettingsCard 53) |
| 5 | Error prevention | 3 | "Database Size 4.90 GB" next to Clear cache implies it frees 5 GB |
| 6 | Recognition | 3 | Disk meaning tooltip-only; "upgrade" search lands on nothing visible |
| 7 | Flexibility | 3 | No archived/outdated filter; filter not in URL |
| 8 | Minimalist | 2 | Counts 3x; ~217 amber marks in replay table |
| 9 | Error recovery | 3 | catches drop ApiError (ReplayCacheCard 47, AiReportsHistoryCard 18); diff-load failure console-only |
| 10 | Help | 3 | Lost "deleted replays never touched" explanation |

Detector: CLI 0. Runtime 26 (was 386-392): undersized 18 (mostly within 10px system; replay table header 10px vs DESIGN 11px), tiny-text 8, em-dash 121 repeated sr-only strings, dark-glow false positive (overlay). All controls named, all focus stops visible, 3 solid red fills.

## Priority issues
- [P1] Replay upgrade simplified away: no idle status, pending, failures, pause; search keywords still point to it (settingsSections 35). Fix: always-visible one-line status in Cached Replays aside from upgradeOverview; restore deleted-replay sentence. -> clarify, harden
- [P1] Archived replays styled as warnings: warn triangle per deleted replay (ReplayCacheTable 149-156); 96 v3 flagged amber though un-upgradable (:161); behind vs newest cached not server version (:64-67). Fix: neutral "Archived" label, behind only for on-disk vs server version, Archived/Outdated filter, proud subtitle count. -> colorize, clarify
- [P2] Replay names truncated at distinguishing part (ReplayCacheTable 144 max-w-[196px]). -> layout
- [P2] Order + duplicated status: opens on destructive Session Cache; DB size mislabeled; System Overview duplicates. Fix: health strip, benchmarks first, cache low. -> distill
- [P3] ApiError messages dropped, window.confirm for AI key, primary button spec, casing. -> polish

## Since last
Resolved: error tones, sticky offset, scrollspy, labels, setup promotion, naming, panels, deep links, sort/filter, red cleanup, clear-cache copy/confirm, formats, aria-expanded, emoji.
Still open: counts 3x, equal-weight frame, scroll-region tab stops + wheel trap, Steam defaults prefilled (useSettingsActions 21-29), dropdown jargon.
New/regressed: upgrade invisibility, 96 amber un-upgradable flags, truncation, ?section=replay-cache lands 45px low (late content), "0 Cached" flash.

## Personas
Power user: no archived/outdated filter, no pause/failures, AI history entries dead-end, cryptic dropdown.
Keyboard/SR: scroll-region tab stops, 121 repeated sr-only strings, Gemini key no visible label, conflicting label/aria-label on benchmark select (ReferenceLaptimesCard 137-144), "0 Cached" announced.
First-run driver: Steam defaults prefilled, no browse/detect again, amber looks broken, AI optional not stated.

## Minor
Stat labels 11 vs spec 10; disabled Save Key pink 50%; 1000px model select; 198 duplicated; 0 shifts in faint.

## Questions
1. Replay Archive as a first-class view?
2. Upgrade switch removal deliberate?
3. What is Settings opened for when healthy?
