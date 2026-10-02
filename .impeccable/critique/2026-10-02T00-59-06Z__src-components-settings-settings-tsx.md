---
target: settings page (after quieter pass)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Documents\\LMULapTime\\src\\components\\settings\\Settings.tsx"
target_fingerprint: "sha256:21c7204c069238a471ad62a4aac0dd53cb64bf7c3d1fb4144531ce85ab05ef0d"
target_path: "C:\\Documents\\LMULapTime\\src\\components\\settings\\Settings.tsx"
timestamp: 2026-10-02T00-59-06Z
slug: src-components-settings-settings-tsx
---
# Settings page critique (after quieter pass)

Method: dual-agent. Score 22/40 (Acceptable).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | TOC scrollspy wrong; Folder Paths never active |
| 2 | Match real world | 3 | "Ready (session)", "Last Delta Sync / Update" |
| 3 | User control | 2 | No reset-to-detected for paths; cache clear irreversible |
| 4 | Consistency | 2 | Three names per section; headings drift from Panel Heading; Rescan still uppercase |
| 5 | Error prevention | 2 | No path validation; Clear Cache copy misstates scope |
| 6 | Recognition | 3 | TOC + search good; name mismatches |
| 7 | Flexibility | 2 | No section deep link; 350-row table no sort/filter |
| 8 | Aesthetic/minimalist | 2 | Paths shown twice; System Overview duplicates stats |
| 9 | Error recovery | 1 | Failures rendered green with check icon |
| 10 | Help | 3 | Good inline copy, Gemini privacy note |

Specificity: content specific, frame generic SaaS settings; quieter pass removed panels + Panel Heading, increasing genericness.
Detector: CLI 0; runtime 386-392 warnings, mostly undersized-ui-text vs 11px floor (DESIGN.md floor is 10px -> system-consistent). Real: unlabeled path inputs (FolderPathsCard 178/193), outline-none on AISettingsCard 79/82 and ReferenceLaptimesCard 151, all-caps path labels, inherited tracking.

## Priority issues
- [P0] Errors render as success: FolderPathsCard.tsx:232 hard-coded text-lmu-green; CacheSettingsCard.tsx:107 and ReferenceLaptimesCard.tsx:129 always CheckCircle2; failures from useSettingsActions.ts:78,83,105,110,129,134. Fix: {tone,text}, loss + AlertCircle, name failing path. -> harden
- [P1] Sticky sidebar top-6 / scroll-mt-6 ignore 67px header (Settings.tsx:138,186): search unclickable, TOC jumps hide headings. Fix top/scroll-mt 84px. -> layout
- [P1] Scrollspy (Settings.tsx:45-64): entries.find picks batch-first; clicks overridden; last section never active. -> harden
- [P1] First-run task buried + unnamed inputs: paths section 7/7, paths shown twice, Steam default looks configured, no htmlFor/id. Fix: single input with inline status, promote + "Setup needed" when missing. -> onboard, distill
- [P2] One Red Rule: three red primaries (Save Key, Update Benchmarks, Rescan), red progress bars (ReplayCacheCard 100, FolderPathsCard 130, ReplayUpgradeCard 293), red Clear link, errors in accent-text not loss. -> polish

## Quieter pass verdict
Right: tiles, decorative hues, heading icons removed; meaning kept.
Too flat: panels dissolved (restore lmu-card or document); On/Off switch reads as tag (ReplayUpgradeCard 269-273); 10px expander no affordance/aria-expanded (BenchmarkImpactBadge 40); Version column should warn on outdated.
Still loud: red primaries/progress; Disk column 350 boxed icons; Rescan uppercase rounded-xl.

## Persona red flags
Power user: no deep link, no sort/filter, MB not GB, 4 date formats, 4 ways to clear search.
Keyboard/SR: unnamed inputs, outline-none x3, TOC no focus move, no aria-live count, no aria-expanded, switch shape.
First-run OSS driver: paths last, Steam default looks set, green failure, "e.g. Bob", star emoji (FolderPathsCard 168), zero-data 0s with Clear enabled.

## Minor
muted/60 opacity dimming (BenchmarkImpactBadge 59); Clear Cache copy misstates scope and omits replay safety, native confirm; diff time without date (ReferenceChangesList 19); italics; sm/md variants; subtitle lists 3/7; filler TOC labels; table scroll container tab stop + wheel trap.

## Questions
1. Surface path problems on dashboard/navbar, leave Settings as maintenance?
2. Replay archive as its own view?
3. Split Setup vs Maintenance?
