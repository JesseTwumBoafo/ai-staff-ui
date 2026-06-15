# Your AI Staff

A desktop app that runs an AI team on your own machine: you give a brief, an orchestrator routes it to specialists, and nothing is written to disk until you approve it.

Your AI Staff is an Electron desktop application for anyone who wants to delegate work to a team of AI agents rather than prompt a single chatbot. You assign a brief, the orchestrator routes it to the right specialists, the specialists draft and review each other's work, and the result is shown to you for approval before it lands in a folder. The app runs against your own model providers and your own local folders, so your data and your API spend stay under your control.

This is a pre-1.0 project: expect rough edges and breaking changes before 1.0, and note that only Windows x64 builds are published today. See [Status](#status) for detail.

## Features

### Multi-agent runs

- A delegating orchestrator receives your brief and routes it to the right specialists, including any you have hired.
- Parallel fan-out runs independent sub-agents at the same time rather than one after another.
- A reviewer-writer loop reviews each draft and sends it back for revision until it passes, then writes the deliverable only on your approval, through a review gate you control.
- A Stop button is wired into every model call and is checked again immediately before the irreversible write, so stopping a run cannot leave a half-written file.
- A sub-agent transcript viewer toggles the detailed back-and-forth of each specialist in or out of the feed.
- Token usage and a cost estimate are shown per run, using per-model pricing.

### Models and providers

- A single model layer covers multiple providers. Anthropic runs through the official SDK; an OpenAI-compatible HTTP path covers OpenAI, Gemini, and local runners such as LM Studio and Ollama, selected by base URL.
- Model calls retry on transient failures and report token usage back to the app.
- Each role carries its own model assignment, set on the agent's profile through dependent provider and model picklists that read live model lists where the provider offers them.

### Connections (MCP)

- A Connections tab links the app to Model Context Protocol servers and exposes their tools across providers rather than to a single one.
- The MCP client speaks to remote servers over HTTP and SSE and to local servers over stdio, and lists the tools each server offers.
- Full OAuth is implemented for servers that need it: PKCE, dynamic client registration, and a loopback redirect through your system browser.
- Quick-add presets are included for ten common services. In alphabetical order: Atlassian, GitHub, Linear, Notion, Salesforce, Sentry, Slack, Stripe, Supabase, and Zapier.

### Local folder I/O

- Real local folder input and output runs through grant-checked IPC. You pick a folder with the native OS picker, and the app reads and writes only inside folders you have granted, enforced by a grant registry.
- Reads and writes are scoped, size-capped, and guarded against path traversal.

### Shell and quality of life

- A command palette (Cmd+K) jumps to any destination, runs a canned brief, opens a profile, or toggles dark mode.
- Conversations are saved and resumable; you can reopen a past run with its brief and deliverable intact.
- Desktop notifications fire when a long-running run finishes while the window is in the background.
- Light, dark, and system themes are supported, with the system option following your OS preference.

## Installation

Builds are published on the [Releases page](https://github.com/JesseTwumBoafo/ai-staff-ui/releases). The current release ships two Windows x64 builds; pick one:

- **NSIS installer**, `Your-AI-Staff-Setup-0.4.0.exe`. Run it to install the app and choose the installation directory. This build receives auto-updates.
- **Portable**, `YourAIStaff-portable-0.4.0.exe`. Run it directly, with no installation. Good for trying the app without writing to Program Files.

The executables are not yet code-signed, so Windows SmartScreen will warn you on first run. If you trust the source, choose "More info" then "Run anyway".

The app brings no model keys of its own. You supply your own provider API keys, and the app makes no model calls without one.

## Getting started

1. Add a provider API key in Settings.
2. Connect a folder so the team has somewhere to read from and write to.
3. Give the team a brief on the Activity page, then review the result before it is written.

A built-in setup guide walks first-time users through the same steps.

## Development

The app is built with Electron, React, TypeScript, Vite, and Tailwind CSS.

### Prerequisites

- Node.js 22.12.0 or newer (`engines.node` is `>=22.12.0`; `.nvmrc` pins 22). With nvm installed, run `nvm use` in the repo root.
- npm (bundled with Node).

### Set up

```bash
git clone https://github.com/JesseTwumBoafo/ai-staff-ui.git
cd ai-staff-ui
npm install
```

### Run in development

```bash
npm run electron:dev
```

This starts the Vite dev server and launches Electron against it once the server is ready. To run the renderer alone in a browser, use `npm run dev`.

### Test

```bash
npm test
```

Tests run with Vitest. The suite covers the folder, naming, and provider modules under `src/__tests__/`.

### Build

```bash
# Build the renderer bundle only
npm run build

# Build the packaged Windows app (NSIS installer and portable)
npm run electron:build
```

`npm run electron:build` runs the renderer build and then packages with electron-builder, writing the installers to the `release/` directory.

## Configuration

- **Provider keys.** API keys are encrypted and stored in your operating system keychain, not in plain files. Add and remove them in Settings.
- **Folder grants.** The app reads and writes only inside folders you have explicitly granted through the native picker. Manage grants on the Folders page.
- **MCP servers.** Configure Model Context Protocol connections on the Connections page, including OAuth for servers that require it.

## Security

The app is built local-first and gated by default:

- A grant registry bounds all folder reads and writes to folders you have granted; reads and writes are size-capped and guarded against path traversal.
- An SSRF guard blocks web fetches to private and loopback addresses.
- A production content security policy is applied, with no inline script execution, and navigation guards open external links in your system browser.
- Provider API keys are stored in the OS keychain, and secrets are redacted from error messages before they reach the interface or a model.

For the full security model, see the release notes on the [Releases page](https://github.com/JesseTwumBoafo/ai-staff-ui/releases).

## Roadmap

Planned work is tracked in [ROADMAP.md](ROADMAP.md). The next major feature is People, a lightweight CRM of the external humans you interact with; it is planned, not shipped, and its design is recorded in [ADR 0001](docs/adr/0001-people-store-persistence.md).

## Licence

All rights reserved. The source is published here so the app can be distributed, but no licence is granted to use, copy, modify, or distribute the code. The repository declares no licence file, and the project is marked private in its package metadata.

## Status

Pre-1.0. The app works and ships real builds, but interfaces and behaviour can still change before 1.0, and Windows x64 is the only platform published today. Track progress in [ROADMAP.md](ROADMAP.md).
