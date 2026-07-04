# ADR 0004: Vault write-back ownership

## Status

Proposed (2026-07-04), for run write-back. Moves to Accepted at sign-off.

## Context

Once a vault is deployed, the app can write back to it: a log of what it did, and
the deliverables it produces. The live operating model states ownership rules the
app should not break. The ledger is "maintained by Oscar via the close_chat
macro" and the roster file says "no other agent writes here".

## Options

- Option A (recommended, simplest viable): the app writes only files it owns. One
  session file per run (no shared-file contention) and deliverables into
  `6. Outputs/drafts/written`. It never edits `open.md` or `team_index.md`
  unprompted; a roster rewrite exists but sits behind an explicit user click.
- Option B: full ledger integration, appending a task row per run. Richer, but
  read-modify-write on a file another system also edits invites merge damage on a
  synced drive, and it crosses an ownership line the model states explicitly.

## Decision

Take Option A. On an approved run the app writes a dated session file
(`bkm/sessions/<date>_app_run_<runId>.md`) it owns outright, and routes the
deliverable into the vault's drafts pipeline by prepending a synthetic Outputs
folder to the array passed to `agent:reviewAndWrite` (the handler writes to the
first read-write folder, so prepending makes Outputs win). Declining the review
gate writes nothing. The roster rewrite is available in the Operating System view
behind an explicit "update vault roster" click. No per-run ledger append ships
(open question 4 default: no; there is no Oscar to own the ledger on a deployed
machine).

## Consequences

- No shared-file contention: session files are app-owned and uniquely named.
- Write-back is fail-soft: a missing sessions folder or an ungranted root returns
  an error the app swallows rather than surfacing mid-run.
- The drafts-to-reviewed-to-final promotion surface is not built (see the ROADMAP
  non-goal). Deliverables accumulate in `6. Outputs/drafts/written` until a later
  promotion feature lands.

## Source

Reviewed design, Decision 3 and Refiloe's completeness note (issue 2):
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-07-04_os-deploy-crossplatform.md`
(Archie, QA-passed by Refiloe, 2026-07-04).
