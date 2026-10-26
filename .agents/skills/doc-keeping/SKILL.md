---
name: doc-keeping
description: Keep LMULapTime docs small, accurate and useful. Audit the whole docs tree or a requested area, update format contracts with relevant code changes, consolidate unfinished work, and delete completed plans, prototypes and redundant reports.
---

# Documentation keeping

Read [the retention policy](../../../docs/DOCUMENTATION.md), then `docs/README.md` and the relevant
contracts/source. A general invocation covers the whole docs tree; a focused request narrows scope.
Inspect Git status and preserve unrelated work.

Keep the smallest useful maintained set: setup/product/design, code ownership, data contracts and
a concise work queue. A separate plan needs substantial unresolved design, not just a few acceptance
checks. Prefer deletion or consolidation to new folders, catalogs, reports or process documents.
Do not preserve full implementation narratives for a small pending follow-up. Prototypes are plans;
delete them after implementation. Code comments can fully own local rationale without another doc.

Reconcile current claims with canonical source, tests, history and evidence. Distinguish proposals,
implementation and acceptance; preserve pending requirements without presenting shipped code as
unfinished. Keep reusable rejected-design conclusions or unresolved findings in their owning document,
not a whole completed audit. Historical test totals, one-off validations and obsolete copies belong
in Git history. Preserve only still-needed requirements and consequential rationale before deleting;
check committed originals/diffs and repair inbound references as the policy specifies.

Treat `XML_FORMAT.md`, `VCR_FORMAT.md`, `TELEMETRY_FORMAT.md`, `LIVE_CAPTURE_FORMAT.md`,
`LMU_REST_API.md` and `REPLAY_CACHE_FORMAT.md` as the canonical written contracts in `docs/`.
Review the affected spec with changes to parsers, readers/writers, schema, channels, units, clocks,
identity or compatibility. Resolve disagreements as bugs, accepted contract changes or uncertain
observations; never silently bless code by rewriting the spec. Keep hypotheses out of established
format facts and do not imply fresh game compatibility or acceptance from source review alone.

Run `python .agents/skills/doc-keeping/scripts/audit_docs.py` from the repository root for inventory,
links/anchors, index reachability and file limits. Review factual usefulness separately: a structural
pass does not establish accuracy. Validate edited skills with the skill-creator validator when available.
Report reductions, preserved requirements and remaining uncertainty concisely. Do not add an audit
report to document routine cleanup or claim an automated/scheduled drift monitor.
