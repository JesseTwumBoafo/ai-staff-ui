# ADR 0002: Vault template source for the deploy scaffold

## Status

Proposed (2026-07-04), for the operating-system deploy feature. Moves to
Accepted at sign-off.

## Context

Deploy scaffolds an ICOR-style operating system (PARA pillars, an agent
workspace, a roster, a starter ledger, SOP stubs, and an outputs pipeline) into a
folder the user chooses. The scaffold content needs a home. Two of its files are
roster and date dependent (`team/team_index.md`, `bkm/tasks/open.md`); the rest
is static text.

## Options

- Option A (recommended): a bundled template tree at `electron/templates/vault/`
  with `{{PLACEHOLDER}}` substitution, plus code that fills the roster and date
  derived files. The tree is editable without touching logic, diffable in review,
  ships free through the existing electron-builder `files` glob (`electron/**`),
  and mirrors the real vault one to one.
- Option B (simplest viable): generate the whole tree in code as literal strings
  in `deploy.cjs`. Fewer moving parts and no asar considerations, but every
  content tweak becomes a code change and a twenty-five-entry skeleton as string
  literals is hard to review.

## Decision

Take the hybrid: a real template tree for static content, plus code that
substitutes tokens (`{{DATE}}`, `{{APP_VERSION}}`, `{{OWNER_NAME}}`,
`{{ROSTER_ROWS}}`) and generates the roster table. A `manifest.json` at the
template root lists the directories and files to create so empty directories are
represented explicitly (git does not track them) and the copier does not scan the
tree. The pure engine lives in an electron-free `electron/deploy-lib.cjs` so it is
unit-testable.

The starter ledger uses the real ledger headers (`Task ID | Description | Owner |
Opened | Deadline | Status | Notes`), so the deployed vault mirrors the live one
and the reader parses both.

## Consequences

- Content churn (SOP stubs, readme text) is a template edit, not a code change.
- The template tree ships in the package with no build-config change; Electron's
  asar-aware `fs` reads it at runtime.
- The two roster and date derived files stay code-generated, which keeps the
  roster table (variable row count) out of a static file.

## Source

Reviewed design, Decision 1:
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-07-04_os-deploy-crossplatform.md`
(Archie, QA-passed by Refiloe, 2026-07-04).
