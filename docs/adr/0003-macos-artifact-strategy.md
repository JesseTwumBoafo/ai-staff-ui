# ADR 0003: macOS artefact and signing strategy

## Status

Proposed (2026-07-04), for macOS packaging. Moves to Accepted at sign-off.

## Context

The app publishes Windows x64 builds only. The goal is to send the app to a
non-technical person on either platform, so macOS needs installers built in CI.
The repo has no native Node modules (dependencies are pure JS: the Anthropic SDK,
the MCP SDK, React), so the usual universal-merge risk is absent.

## Options

- Artefact shape. Option A (recommended): a universal (arm64 plus x64) dmg and
  zip, one download link for any Mac. Option B: arm64-only, smallest but silently
  excludes Intel Macs with an opaque "app won't open" failure. Option C: separate
  arm64 and x64 artefacts, which pushes an architecture choice onto the recipient.
- Signing. Ship signed and notarised now (needs an Apple Developer ID, USD 99 a
  year), or ship unsigned at pre-1.0.

## Decision

Ship a universal dmg and zip built on a `macos-latest` CI job, unsigned at
pre-1.0 (`build.mac.identity` is `null` so the CI build does not fail hunting for
a Developer ID). The dmg is the human download; the zip is the auto-update
artefact.

## Consequences

- Gatekeeper: on current macOS the right-click-Open bypass no longer works for
  unsigned downloads. The recipient must open System Settings, Privacy and
  Security, and click "Open Anyway" after the first blocked launch. The README
  documents this.
- Auto-update: electron-updater validates code signatures on macOS, so auto
  update does not function for unsigned builds (the failure is swallowed in
  `initAutoUpdate`). Mac users update manually until signing lands.
- Later path (no repo restructuring needed, config plus secrets only): add an
  Apple Developer ID, `CSC_LINK` / `CSC_KEY_PASSWORD` secrets in the mac CI job,
  `hardenedRuntime: true` with the standard Electron entitlements, and
  notarisation via `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` or an App Store
  Connect API key.
- Real-Mac verification (Gatekeeper flow, window chrome, an agent run) is a hard
  prerequisite held for Bubble: macOS binaries cannot be produced or verified on
  the Windows ARM64 dev box.

## Source

Reviewed design, Decisions 2 and 5, and the macOS risk audit (M1 to M5):
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\reviewed\architecture\2026-07-04_os-deploy-crossplatform.md`
(Archie, QA-passed by Refiloe, 2026-07-04).
