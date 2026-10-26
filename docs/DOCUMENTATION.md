# Documentation lifecycle

Adopted 2026-10-25. Keep the checked-out documentation useful for understanding the product,
continuing work and avoiding past mistakes. Git records the editing history; maintained documents
record the requirements, decisions and evidence that still matter.

## Where information belongs

| Information | Home | Keep current |
|---|---|---|
| Setup and supported workflows | Root README and focused reference docs | Commands, prerequisites and observed behavior |
| Product requirements and visual conventions | `PRODUCT.md`, `DESIGN.md` | Accepted scope, constraints and exclusions |
| Implementation and ownership | `docs/CODE_MAP.md` | Canonical modules, contracts and invalidation rules |
| Binary/channel/API findings | Relevant `*_FORMAT.md`, `LMU_REST_API.md` | Established facts, evidence provenance and compatibility limits |
| Unfinished substantial work | `docs/plans/<topic>.md`, indexed in `docs/plans/README.md` | Requirements, decisions, status, next step and acceptance gates |
| Analysis and experiments | A focused section or companion analysis linked from its plan/reference | Question, method, observations, uncertainty and resulting decision |
| Durable decision rationale | A Decision section in the owning reference; use `docs/decisions/` when it spans several areas | Date, context, chosen option, alternatives, reason, consequences and supersession links |
| Completed delivery evidence still needed | Selected `docs/plans/archive/` records | Dated historical outcome and evidence; link to current guidance |
| Private or temporary investigation | Ignored `docs/local/` or existing temporary directories | Never the sole home of shared requirements or decisions |

Use existing documents before creating another one. Keep one authoritative home per fact and link
to it from indexes. Create a decisions directory only when a concrete cross-cutting decision needs it.
Follow the repository's 20-files-per-directory limit; group by subject rather than adding generic
archive layers. A screenshot or prototype is worth tracking when it conveys accepted behavior or
irreplaceable evidence; production code alone does not explain why an alternative was rejected.

## Keep format specifications authoritative and current

The format references are the canonical written contracts for data the app consumes or produces:
`XML_FORMAT.md` for results XML, `VCR_FORMAT.md` for replay binaries, `TELEMETRY_FORMAT.md` for
native DuckDB telemetry, `LIVE_CAPTURE_FORMAT.md` for app-owned capture and evidence, and
`LMU_REST_API.md` for observed game API behavior. `CODE_MAP.md`, plans and analysis link to these
contracts rather than maintaining competing field definitions. Add a focused reference and index
entry when a genuinely new format has no owner; do not force unrelated schemas into these files.

When changing a parser, decoder, schema, serializer, channel mapping, recording reader/writer,
units, timing, identity, reconciliation or compatibility behavior, review its owning spec in the
same change. Update affected fields, types, units, null/sentinel semantics, coordinate frames,
timestamp origin/rate, binary offsets/endianness, table/schema versions, ownership and compatibility
rules as applicable. Document before/after behavior and any parser/model/schema version bump or
reparse path. Preserve the repository's domain invariants and external-data boundaries.

Each maintained format reference should identify its scope, canonical reader/writer or parser,
supported or observed versions/builds, evidence and verification limits, and relevant validation
tests or fixtures. Add missing provenance when reviewing that section; do not invent a game build,
review date, measurement or compatibility claim. Date only the portions actually reviewed, and
link private evidence by a safe identifier without committing personal recordings.

The spec defines the documented contract; implementation, focused tests and recorded evidence
show whether it is met. If they disagree, investigate and record whether this is an implementation
bug, an approved contract change or an unresolved observation. Fix the implementation for a bug;
update the spec for an established change. Keep uncertain byte/channel interpretations in analysis,
clearly marked as hypotheses, until supported by evidence. Do not silently bless code by copying
its behavior into a spec or treat a proposal as an observed external format.

At the end of relevant implementation work, inspect the diff for contract changes and reconcile
the affected spec and plan status. In the completion report, name the spec sections updated or
briefly explain why the reviewed contract is unchanged. For an explicit documentation audit,
compare the affected specs to their canonical implementations and tests, record discrepancies and
resolve those supported by available evidence. State remaining external validation explicitly.
This is a task-completion workflow, not a scheduled monitor or a claim of automatic drift detection.

## Plans, requirements and decisions

For a substantial change, keep the plan compact: status and review date, scope and non-goals,
requirements with observable acceptance criteria, material decisions and their reasons, evidence,
open questions, dependencies and the next useful action. Use requirement IDs only when they help
trace several acceptance checks. Small fixes can update their owning reference without a new plan.

Use `Proposed`, `In progress`, `Blocked` (with the dependency), `Completed` or `Superseded`.
Separately state delivery evidence: local implementation, committed on a named branch, integrated
into the target branch, automated validation and real-game/browser acceptance. Record only what
was verified. A merged implementation with a pending real-race gate is still awaiting acceptance.

Record accepted user requirements separately from inferred assumptions and unresolved proposals.
When a requirement or decision changes, update the current statement and retain a concise dated
reason if it explains a meaningful constraint or rejected direction. Link the superseded decision
to its replacement. Do not keep contradictory instructions as equally current or transcribe chats.

For analysis, distinguish measurements from hypotheses. Identify the date, code revision/build,
dataset or recording and method when known; say when provenance is missing or data is private.
Preserve enough method and results to assess the conclusion without committing raw recordings.
Mark rejected options and the reason so later work does not repeat an unsuccessful experiment.

## What stays in Git

Track shared requirements, current contracts, consequential decisions, reproducible methods,
small permitted fixtures and evidence that cannot reasonably be regenerated. Commit documentation
changes with the implementation they explain where practical. Update references when behavior
changes; summarize material before/after behavior and rationale rather than keeping a running
diary or a second copy of the Git log. Use a changelog only if a release workflow needs one.

Keep caches, databases, raw captures, generated bundles, temporary benchmark output, credentials,
personal data and externally supplied detailed geometry out of Git under existing ignore rules.
Retain a small sanitized result and reproduction instructions when useful. A deliberately captured
schema such as `swagger-schema.json` can be evidence even though it is generated; classify by
purpose and reproducibility, not extension. Ignoring an already tracked file does not untrack it.

## Complete, consolidate or delete

At completion, promote current behavior and still-relevant requirements/decisions to their owning
documents. Carry unfinished acceptance or follow-ups into an active plan. Then choose:

- **Keep current:** readers still need the requirements, contract, decision or operational guidance.
- **Archive selectively:** the delivery record has unique migration, analysis or acceptance evidence
  still worth finding. Give it a dated outcome and link to current guidance; it is not a runbook.
- **Delete:** the plan/checklist, draft, duplicate analysis or prototype is superseded, its useful
  content has been promoted, and no unique requirement, rationale, evidence or follow-up is lost.
- **Keep local/ignored:** the artifact is temporary or private and has no shared maintenance value.

Do not archive every completed checklist by default. Existing archives can be assessed during an
explicit cleanup; their age alone does not justify deletion. Protect unrelated uncommitted work.
Do not rewrite Git history, clean whole directories or remove local recordings as doc housekeeping.
Deleting a sensitive tracked file does not remove it from history; flag exposure for separate handling.

Before relying on Git history to delete a document, inspect `git status --short -- <path>`,
`git diff -- <path>`, `git diff --cached -- <path>`, `git ls-files -- <path>` and
`git log --follow -- <path>`. Inspect the relevant committed version with `git show <commit>:<path>`;
untracked files and uncommitted additions are not recoverable from Git history. Preserve any unique
working-tree content first. History recovery also depends on retaining the repository and commits.

Search inbound references with `rg` (including `AGENTS.md`, root docs and affected code), update
links and plan indexes in the same change, and leave a concise retained decision with a verified
commit/path pointer when future readers need the deleted evidence. For a rename, repair relative
links inside the moved document as well. Removing the last copy of a still-relevant decision is
not consolidation even when an old commit can technically be recovered.

## Verify a documentation change

Review the scoped diff and check affected links, anchors, file counts, commands and claims against
their sources. Preserve other work in progress. Report what was updated, retained, deleted and
deferred, with the reason for material deletions. Do not imply that tests, benchmarks, browser checks
or live LMU acceptance were run unless they were. For documentation-only changes, validate the
documents and skill; application checks apply when executable behavior also changes.
