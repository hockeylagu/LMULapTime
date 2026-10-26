# Keep documentation small and current

Policy updated 2026-10-25. Keep documents that help someone operate or change the current app.
A few remaining checks do not justify retaining a completed implementation plan.

## What belongs here

- Current setup, product/UI requirements, module ownership and public data contracts.
- One concise work queue for acceptance checks and small follow-ups.
- A separate active plan only when substantial unresolved design needs it; prototypes are plans
  and are deleted after implementation. Proposals state the outcome, constraints and next decision.
- Investigations only while their unresolved findings or evidence have a concrete future use.

Use code comments for local reasons and constraints. Do not document every helper, copy the source
into prose, keep a second changelog or duplicate the same fact across a plan, inventory and report.
Keep the user-facing requirements in PRODUCT/DESIGN, contracts in format docs and ownership in
CODE_MAP. Link to the authoritative home instead of repeating it. Keep folders only when needed.

## Changes and evidence

Review the owning format spec alongside parser, reader/writer, schema, field/unit/sentinel, clock,
identity or compatibility changes. Record version/reparse implications when relevant. The spec is
not automatically correct because code matches it: resolve disagreements with implementation,
tests and recording evidence; distinguish bugs, accepted changes and unresolved interpretations.
Keep hypotheses separate from established facts. Record only the portions actually verified;
never refresh a whole document's date to imply unperformed validation.

Distinguish proposed, locally implemented, committed/integrated and externally accepted work.
Carry unresolved acceptance into the queue after implementation. Preserve meaningful requirements
and consequential rationale, not every past discussion, test count or observed example.

## Delete when no longer useful

After delivery, remove the plan, prototype, old validation report and redundant analysis. Promote
only still-needed content first; adequate comments beside the code can already be its home.
Do not relocate obsolete material to an archive or create a replacement historical catalog.
Keep raw captures, caches, databases, generated builds and private scratch out of Git.

Before relying on Git recovery, inspect tracked status, staged/unstaged diffs and history with
`git status --short -- <path>`, `git diff -- <path>`, `git diff --cached -- <path>`,
`git ls-files -- <path>` and `git log --follow -- <path>`; verify the committed version with
`git show <commit>:<path>`. Git does not preserve uncommitted work. Preserve unrelated edits and
still-needed requirements. Remove inbound links and empty folders with the retired file.
Do not remove local recordings or rewrite history as documentation housekeeping.

## Review

A general doc-keeping run reviews the whole docs tree for usefulness, accuracy, placement and
retention; a focused request can narrow it. Prefer consolidation and deletion to adding process.
Run `python .agents/skills/doc-keeping/scripts/audit_docs.py` for structural checks, then review
claims against source and evidence. Passing links does not establish factual accuracy. Report the
actual scope, reductions and remaining uncertainties. Application checks apply to behavior changes;
documentation-only changes need document/skill validation, not fresh game acceptance.
