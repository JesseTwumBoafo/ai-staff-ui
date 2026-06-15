# Sources update for _sources.md in vault

Add this section to:
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\drafts\design\_sources.md`

---

## v3 desktop shell redesign

**Date:** 2026-06-11

**Design research source:**
`G:\My Drive\8. Agents\ai_team_root\6. Outputs\drafts\written\2026-06-11_desktop-app-design-language-research.md`
(Research note by Robert, commissioned 2026-06-11, high confidence, six reference apps: Slack, VS Code, Postman, Figma, Mailspring, Bitwarden)

**What changed from v2:**

- Replaced mobile-style layout (centred column, bottom nav) with three-column desktop shell: 56px dark rail, 240px sidebar, fluid content well
- Deleted bottom navigation bar; all five destinations on the rail (Home, Team, Folders, Setup guide, Hire) with gear pinned at bottom
- Added fake frameless title bar (32px) with decorative macOS-style traffic light controls
- Implemented Cmd+K command palette wired to real actions: navigate, view profile, run canned briefs
- All CSS variables on :root using the design system token set from the research note
- Type scale: 11px metadata / 12px labels / 13px body / 15px headings / 18px surface titles; Inter with system fallback
- Contextual sidebar: activity list on Home, roster list on Team, folder list on Folders, progress block on Onboarding
- Presence dots (10px, 2px white ring) on all agent avatars; active = #22A06B, idle = #9C97B0
- Feed rows: 16px left padding, avatar, timestamp right-aligned; date separators with hairlines
- Review gate cards redesigned as dense bordered panels (no floating cards with shadows)
- Retire confirmation moved from window.confirm to a proper ConfirmModal (destructive confirmation pattern)
- Toast notification system: bottom-right, 200ms slide-in, auto-dismiss info/success, persist warning/error
- Onboarding redesigned as welcome pane (Nadia intro + progress bar) + checklist rows; no violet hero gradient
- Button heights: 32px primary, 28px secondary; all 44px+ touch targets removed
- Border radius system: rail 0, rows 4px, cards 6px, buttons 6px, modals 8px
- No external CDN references; fully self-contained

**New components added:**
- `src/components/Toast.tsx` — toast notification system
- `src/components/ConfirmModal.tsx` — destructive confirmation modal
- `src/components/CommandPalette.tsx` — Cmd+K command palette

**Rebuild commands (from C:\dev\ai-staff-ui):**
```
npm run build           # dist/ (standard, ~308 KB total)
npm run build:single    # dist-single/index.html (single file, ~309 KB)
```

**Output file:** `2026-06-11_ai-staff-ui-prototype.html`
**Single-file size:** ~306 KB (gzip: ~87 KB)
**Self-containment:** Verified — zero external http/https src/href/url()/@import references
