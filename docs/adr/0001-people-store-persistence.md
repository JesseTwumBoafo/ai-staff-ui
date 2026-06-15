# ADR 0001: People store persistence

## Status

Accepted (2026-06-15), for the Phase 0 People feature.

## Context

The People (lightweight CRM) feature needs a place to persist its contact store:
the `PeopleStore` shape (people, interactions, merge and split decisions, and
per-source "last scanned" times) plus all manual edits, which are the source of
truth and must survive a re-scan and a reload.

Two facts shape the decision:

- The app already has one consistent persistence pattern. Every persisted slice
  uses a single `localStorage` key behind a small module with a try/catch and a
  defensive parse: `src/runs.ts` (key `ai-staff-runs`, capped at `MAX_RUNS = 30`)
  and `src/folders.ts` (key `ai-staff-folders`). There is also a main-process
  file pattern for state the renderer should not own: `electron/agent.cjs` writes
  `ai-connection.json` and `electron/grants.cjs` writes `granted-folders.json`,
  both under `app.getPath('userData')`.
- The `localStorage` quota is typically about 5 MB per origin (confidence:
  medium; confirm against the Chromium version this Electron build ships before
  any cap number is hard-coded). Run transcripts already share that budget, which
  is why `ai-staff-runs` is capped. People interactions could grow large once
  connector ingestion (Phase 2) lands.

This ADR covers only where the store lives. Identity resolution, merge
semantics, IPC, and phasing are in the reviewed design (see Source).

## Options

- Option 1, `localStorage` (simplest). A single `localStorage` key
  `ai-staff-people` holding the `PeopleStore`, behind a new `src/people.ts`
  module that mirrors `src/runs.ts` exactly. Cheapest, no new IPC, consistent
  with every other persisted slice. Bounded by the browser quota and cleared if
  the user clears renderer storage.
- Option 2, main-process JSON file. A `people.json` under
  `app.getPath('userData')`, like `ai-connection.json` and
  `granted-folders.json`. More headroom than the browser quota and survives a
  renderer storage clear, but adds read and write IPC, a load path, and a
  migration from any earlier `localStorage` data.

## Decision

Adopt Option 1 for Phase 0 and the first release: a single `localStorage` key
`ai-staff-people`, behind `src/people.ts` mirroring `src/runs.ts`. To stay within
the quota, cap stored interactions per person and in total, and store interaction
summaries rather than full bodies.

The added complexity of Option 2 (extra IPC plus a migration) is not justified
while volume is small, so it is deferred rather than chosen now. The trigger for
revisiting is recorded below so the move is not a fresh open decision but a
planned migration.

## Consequences

- Phase 0 ships with no new IPC and no main-process change for persistence; the
  store reuses the proven `src/runs.ts` pattern, keeping the codebase consistent.
- The store is bounded by the browser quota (about 5 MB) and is cleared if the
  user clears renderer storage. Caps and summary-only storage keep the feature
  inside that budget through Phases 0 and 1.
- Migration trigger. When connector ingestion (Phase 2) drives real volume past
  the quota, or when surviving a renderer storage clear becomes a requirement,
  move the store to a main-process JSON file under `app.getPath('userData')`
  (the `ai-connection.json` / `granted-folders.json` pattern), with read and
  write IPC and a one-time migration that reads the existing `ai-staff-people`
  key and writes the file. That move will be recorded in a new ADR that
  supersedes this one; this ADR is not edited when it happens.
- Open item carried forward: confirm the `localStorage` quota against the shipped
  Chromium version before any cap number is hard-coded (reviewed design, open
  question 2).

## Source

Reviewed design, Decision A and the persistence note:
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-06-15_people-crm.md`
(Archie, QA-passed by Refiloe, signed off by Bubble, 2026-06-15).
