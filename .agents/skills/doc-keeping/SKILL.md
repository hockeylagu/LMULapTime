---
name: doc-keeping
description: Maintain LMULapTime documentation, active plans, requirements, decision rationale and format contracts. Use for documentation audits or cleanup and substantial changes to requirements, delivery status, parsers or data formats; skip unrelated small edits.
---

# Documentation keeping

Use this repository's [documentation lifecycle](../../../docs/DOCUMENTATION.md) as the policy.
Read it first, then the relevant entries in `docs/README.md`, `docs/plans/README.md` and affected
references. Work from the repository root; paths in this skill are repository-relative except links.

## Choose the scope

For implementation work, reconcile only the affected docs and plan status before reporting completion.
For an explicit docs review, inventory the requested area and reconcile requirements, decisions,
analysis and current behavior. A request to establish this workflow does not authorize bulk deletion
or a repository-wide rewrite. Inspect Git status first and preserve unrelated work in progress.

## Keep a useful current record

- Give each requirement, contract and decision one authoritative home; link other mentions to it.
- Keep requirements and observable acceptance separate from proposals and inferred assumptions.
- Record material decisions with date, context, alternatives, rationale, consequences and replacement
  links. Summarize changed behavior and why it changed; use Git for line-by-line editing history.
- Distinguish local implementation, branch commits, target-branch integration, automated checks and
  real-game/browser acceptance. Retain pending gates and next actions even after code is complete.
- Identify analysis methods, dated observations, provenance and uncertainty. Preserve useful rejected
  options without turning speculation into a format definition or repeating old experiments.

## Treat format docs as written contracts

Route results XML to `docs/XML_FORMAT.md`, replay bytes to `docs/VCR_FORMAT.md`, native DuckDB
telemetry to `docs/TELEMETRY_FORMAT.md`, app-owned live capture to `docs/LIVE_CAPTURE_FORMAT.md`
and observed game API behavior to `docs/LMU_REST_API.md`. Follow existing links for canonical
implementations and tests. Create a new focused spec only for a format without an existing owner.

Review the owning spec whenever a change affects readers, writers, parsers, binary fields, channel
mappings, schemas, units, timing, identity or compatibility. Reconcile field/type/unit/sentinel
semantics and version/reparse behavior in the same change, as applicable. Keep code maps and plans
linked to the spec rather than duplicating definitions. Add missing reader/writer, version and
verification provenance for the sections actually reviewed; do not claim an entire spec was audited.

Resolve disagreements using the documented contract, implementation, relevant tests and available
recordings. Identify a bug, an established contract change or an unresolved finding. Never silently
update a spec to bless a bug. Keep reverse-engineering hypotheses and detailed discovery evidence
in analysis; the established spec can link to them for provenance. Do not claim fresh external
format compatibility from a code review alone.

## Retire documents selectively

Promote durable requirements, current behavior and consequential rationale before retiring a plan.
Keep an archive only when its unique delivery evidence remains useful. Delete obsolete duplicates,
checklists and drafts only after checking tracked status, staged and unstaged diffs, committed content
and history as described in the lifecycle policy. Git history does not preserve uncommitted changes.
Keep current decisions discoverable without requiring readers to search old commits.

Use existing ignore rules for private recordings, caches and temporary output. Do not delete local
source data or rewrite history as housekeeping. Repair inbound references and relative links, update
indexes and preserve unfinished acceptance in the same scoped change.

## Verify and report

Review the diff; check affected links/anchors, commands, file counts and evidence claims. Run the
skill validator when editing this skill. Application checks are required when executable behavior
changes; documentation-only work needs scoped document validation. Report the docs/spec sections
updated (or why a reviewed contract is unchanged), material retention/deletion decisions and any
remaining validation gaps. Do not represent this workflow as an automatic or scheduled drift check.
