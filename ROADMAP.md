# Your AI Staff, roadmap

Living roadmap for the desktop app. Newest planned work at the top of each
section. Keep entries concrete: scope, files touched, acceptance.

## Conventions

- British English, plain prose, standard bullets.
- Each feature is phased so something usable ships at the end of every phase.
- Personal data stays on the machine unless the user explicitly opts a source in.

---

# Operating system deploy, cross-platform, and the Operating System view

Delivered as four stacked feature branches (macOS packaging, deploy engine,
Operating System view, run write-back). Full grounded design:

`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-07-04_os-deploy-crossplatform.md`
(Archie, QA-passed by Refiloe). Decisions recorded in ADRs 0002 to 0004.

## What shipped

- macOS packaging: universal (Apple Silicon and Intel) dmg and zip, a
  `macos-latest` CI job, darwin window chrome (native traffic lights via
  hiddenInset), and a PATH fix so stdio MCP servers spawn from a Finder-launched
  app. Windows builds unchanged.
- Deploy engine: pick a folder and scaffold the operating system idempotently
  (PARA pillars, agent workspace with the deliberate 6-to-8 gap, roster seeded
  from the app, starter ledger with the real headers, SOP stubs, outputs
  pipeline). Re-running creates only what is missing.
- Operating System view: reads the deployed vault live (roster, tasks, sessions,
  SOPs, outputs), with a roster drift notice and a gated rewrite.
- Run write-back: an approved run writes a dated session log it owns and routes
  its deliverable into `6. Outputs/drafts/written`.

## Non-goals (deferred, not dropped)

- In-app promotion pipeline. Deliverables land in `6. Outputs/drafts/written`
  and stay there; there is no in-app step to move a draft on to reviewed and then
  final. A deployed user's outputs accumulate in drafts until a promotion surface
  is built. Deferred deliberately (ADR 0004 and Refiloe's completeness note), not
  dropped.
- Code signing and notarisation on macOS, and auto-update for unsigned mac
  builds. Pre-1.0 ships unsigned; the signing path is config plus secrets when
  adopted (ADR 0003).
- Two-way roster sync. The app roster is the source of truth; the vault
  `team_index.md` is a regenerable mirror behind an explicit click.
- Claude Code setup on the deployed machine, an environment concern rather than
  the app's.

---

# Planned: People (lightweight CRM)

This section is the roadmap-altitude summary. The full, grounded design (data
model in detail, merge semantics, component-by-component IPC, file-level touch
points, alternatives, and open questions) is the source of truth and lives in the
vault at:

`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-06-15_people-crm.md`

That reviewed design supersedes the earlier sketch this section used to carry.
The sketch assumed three things that do not hold in the repo today, now
corrected below: a HomeView free-text pre-fill prop (none exists; only
`initialFlowId` does), renderer-callable MCP tools (MCP tools run only inside a
main-process session and are namespaced `serverName__toolName`), and unguarded
vault reads (all vault reads go through grant-checked IPC).

## Goal

Surface the external humans the user has interacted with, CRM-style: a browsable
list of contacts, and a profile per person showing who they are, when you last
spoke, the history of interactions, and the files, threads, and meetings tied to
them. From a contact you can hand the team a brief about that person (draft a
follow-up, prep for a meeting, summarise our history), reusing the existing brief
and review-gate flow.

This is a CRM of external humans, not of the AI staff. The AI staff stay on the
Team view; People is a separate destination.

## Data model (summary)

Added to `src/data/types.ts`, mirroring the existing interface style:

- `Person`: `id`, `displayName`, `emails: string[]` (normalised, primary first),
  `aliases: string[]`, `company?`, `role?`, `avatarColour`, `sources:
  PersonSource[]`, `firstSeen`, `lastSeen`, `interactionCount`, `tags: string[]`,
  `notes?`, `pinned?`, `hidden?`.
- `Interaction`: `id`, `personId`, `type: 'email' | 'meeting' | 'file' |
  'mention' | 'manual'`, `date`, `summary`, `direction?: 'in' | 'out'`,
  `sourceRef: InteractionSourceRef`.
- `InteractionSourceRef`: a tagged pointer back to origin, one of `{ kind: 'run';
  runId }`, `{ kind: 'vault'; path }`, `{ kind: 'gmail'; threadId }`, `{ kind:
  'calendar'; eventId }`, `{ kind: 'drive'; fileId }`, `{ kind: 'manual' }`.
- `PersonSource`: `'manual' | 'runs' | 'vault' | 'gmail' | 'calendar' | 'drive'
  | 'crm'`.
- `PeopleStore` (the persisted shape): `people`, `interactions`, `mergedFrom`
  (loser id to winner id, so a re-scan re-applies merges), `splitApart` (sorted,
  pipe-joined person-id pair keys the user has separated, so a re-scan does not
  re-merge them), and `lastScanned` (per-source time).

Identity and merge rules. Dedupe by normalised email first (exact match
collapses); name similarity is a suggestion only, never an automatic merge.
Merges are idempotent across re-scans via `aliases`, `mergedFrom`, and
`splitApart`. On a merge: `firstSeen` takes the minimum, `lastSeen` the maximum;
`interactionCount` is recomputed from distinct `sourceRef`s (not summed, to avoid
double-counting); `emails`, `aliases`, `sources`, `tags` set-union; manual fields
(`company`, `role`, `notes`, `avatarColour`, `pinned`, `hidden`) on the surviving
record always win and are never overwritten by a scan.

## Seams (renderer surface / main-process module / IPC channel)

Each piece names the real seam it touches. New IPC names follow the existing
conventions (`folders:*`, `agent:*`, `config:*`).

- Contact store. Renderer: new `src/people.ts` (store plus pure helpers,
  mirroring `src/runs.ts` and `src/folders.ts`). Main: none. IPC: none.
- Local derivation, runs. Renderer: parser in `src/people-scan.ts` reading saved
  runs via `getRuns()` from `src/runs.ts`. Main: none (runs live in
  `localStorage`). IPC: none.
- Local derivation, vault. Renderer: `PeopleView` parses returned text. Main:
  `electron/main.cjs` `registerFileIpc`, grant-checked via `isWithinGrant` in
  `electron/grants.cjs` and capped at `MAX_READ_BYTES` (256 KB). IPC (reused):
  `folders:list`, `folders:read`. An optional `people:scanVault` aggregate walk
  in `electron/main.cjs` is adopted only if the per-file approach proves slow.
- Connector ingestion (Gmail, Calendar, Drive). Renderer: new
  `window.electronAPI.scanPeople(opts)`. Main: a new handler in
  `electron/agent.cjs` (it owns the MCP session lifecycle) that calls
  `createMcpSession(await resolveMcpConfigs(), onLog)` from
  `electron/mcp-client.cjs`, resolves the right namespaced tool at runtime from
  `mcp.tools` (`serverName__toolName`), and closes the session in a `finally`.
  IPC (new): `people:scan`, exposed in `electron/preload.cjs` as `scanPeople`,
  typed in `src/electron.d.ts`.
- People list and profile. Renderer: new `src/views/PeopleView.tsx`, reusing the
  visual language of `src/views/ProfileView.tsx`. Main: none. IPC: none.
- App shell wiring. Renderer: `src/App.tsx` adds `people` to `NAV_ITEMS` and
  `STABLE_VIEWS`, a `peopleSelectedId` state, a `renderSidebar` branch, and the
  `'people'` member of `AppView`. Main: none. IPC: none.
- Command-palette jump-to-person. Renderer: `src/components/CommandPalette.tsx`
  gains `people` data and an `onViewPerson` callback, mirroring `teamActions` and
  `onViewProfile`. Main: none. IPC: none.
- Brief the team about a person. Renderer: a profile action builds a brief string
  and routes it into Home. This needs a new `initialBrief` free-text pre-fill on
  `HomeView` mirroring `initialFlowId` (HomeView has no text pre-fill prop today).
  Main: `electron/agent.cjs`, handlers unchanged. IPC (reused):
  `agent:runOrchestrator`, `agent:reviewAndWrite`, `agent:event`, `agent:stop`.

## Privacy stance

People data is personal-sensitive, so the stance is local-first and gated:

- Connector reads run in the main process through the existing MCP session, never
  in the renderer.
- Filesystem reads stay inside granted folders (`isWithinGrant`) and respect the
  256 KB read cap.
- Each connector source is opt-in with a plain-language note on what is read; a
  visible "last scanned" state shows recency.
- Local-only storage; nothing leaves the machine except a model call the user
  explicitly triggers, and that call passes the existing review gate.
- A one-click "forget this person" removes the record and suppresses it from
  future scans (kept as a tombstone so a re-scan does not resurrect it).
- The first scan pass is deterministic (email headers, note front matter,
  attendee lists), not a model call, to keep scanning cheap and predictable.

## Phasing (local-first)

Sequenced by code dependency: data already in the app first, connectors second,
action third, sync last. Each phase ships something usable.

Phase 0, store and manual contacts (renderer only, no IPC, no external reads)
- `Person` / `Interaction` / `PeopleStore` types; `src/people.ts`; `PeopleView`
  shell; rail item, `STABLE_VIEWS`, sidebar branch, and selection state in
  `src/App.tsx`; manual add, edit, pin, tag, delete.
- Acceptance: add, edit, pin, tag, and delete a contact; it persists across a
  reload.

Phase 1, derive from data already in the app (renderer plus reused file IPC)
- Deterministic parsers for runs and vault in `src/people-scan.ts`; identity
  resolution v1 (email dedupe, name suggestions); merge and split UI; per-source
  "last scanned" state; a manual "Scan now". Adopt `people:scanVault` only if the
  per-file approach is slow.
- Acceptance: scanning a vault with meeting notes plus saved runs yields a
  deduped contact list with interaction counts and last-contact dates; a re-scan
  never clobbers a manual edit.

Phase 2, connector ingestion (new IPC plus main-process MCP)
- `people:scan` handler in `electron/agent.cjs`; `scanPeople` in
  `electron/preload.cjs` and `src/electron.d.ts`; per-source opt-in UI with a
  "what is read" note; richer interaction timeline; recency and frequency on
  cards.
- Acceptance: with Gmail connected and opted in, correspondents appear with a
  dated email timeline that links back to threads.
- Note: open question 3 (connector tool mapping) gates this phase only; Phases 0,
  1, and 3 are unaffected and can proceed without it.

Phase 3, act from a contact (renderer reuses the agent path)
- "Brief the team about ..." on the profile with intents (follow-up, meeting
  prep, history summary); the new `initialBrief` prop on `HomeView` and the
  `App.tsx` handler; light enrichment of company and role.
- Acceptance: from a contact, generate a gated follow-up draft without leaving
  People; nothing is written or sent until the review gate is approved.

Phase 4, sync and nudges (deferred)
- CRM connector sync (Salesforce, HubSpot, Notion contact objects) for users who
  have them; segments and pins; optional reminders ("no contact with X in 30
  days").
- Acceptance: a connected CRM's contacts merge cleanly with derived contacts;
  reminders can be enabled and dismissed.

Command-palette jump-to-person is small and can land alongside Phase 0 or
Phase 1; it depends only on the store and the view selection state.

## Open questions

Each has a sensible default already taken; see the reviewed design for the full
treatment.

- Connector tool mapping. The concrete MCP tools depend on which servers the user
  configures in `ConnectionsView`; Gmail, Calendar, and Drive are not hard-wired.
  Default: match by server name and tool-name pattern, degrade gracefully. This
  is the one item that gates a phase contract (Phase 2 only); resolve it before
  Phase 2 starts.
- Interaction retention and "forget". Default: "forget" sets `hidden: true`,
  removes the record from the list, and suppresses it from future scans as a
  tombstone. Confirm whether it should hard-delete instead.
- Persistence at first release. Default: `localStorage` key `ai-staff-people`
  (see `docs/adr/0001-people-store-persistence.md`), with interactions capped and
  summaries stored rather than bodies. Confirm the cap strategy.
- Scan trigger. Default: manual "Scan now" plus a scan on opening People, not a
  background scheduler, until cost and noise are understood.
- Scope of the runs parser. Default: parse `brief`, `deliverable`, and step text
  for emails and capitalised names. Confirm whether mentions inside sub-agent
  transcripts should also count as interactions.

Source: reviewed design at
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-06-15_people-crm.md`
(Archie, QA-passed by Refiloe, signed off by Bubble, 2026-06-15).

---

# Shipped

- v5 desktop shell: rail, contextual sidebar, command palette, connections
  (MCP), real folder I/O, multi-provider agent runs. See
  `VAULT_SOURCES_UPDATE.md` for the v3 redesign notes.
