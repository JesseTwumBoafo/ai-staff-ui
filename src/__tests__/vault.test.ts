import { describe, it, expect } from 'vitest'
import {
  parseTeamIndex,
  parseTaskTable,
  parseSessionRefs,
  joinPath,
  rosterDrifted,
  updateRosterInTeamIndex,
  buildSessionEntry,
} from '../vault'

const TEAM_INDEX = `---
title: Sam's AI Team, Roster Index
maintained_by: Your AI Staff (in-app)
version: 1.0
last_updated: 2026-07-04
---

# Roster Index

## Active roster

| # | Name | Role | Lane | Persona file | Status | Hired |
|---|------|------|------|--------------|--------|-------|
| 1 | Nadia | Your manager | orchestration | in-app agent | active | 2026-07-04 |
| 2 | Callum | Writes things | writing | in-app agent | active | 2026-07-04 |

## Capability summary

Shown in the app.
`

// Uses the real ledger headers (Task ID | Description | Owner | Opened | Deadline
// | Status | Notes), per the binding correction.
const LEDGER = `---
type: Task Ledger
---

# Open Tasks Ledger

## Tasks

| Task ID | Description | Owner | Opened | Deadline | Status | Notes |
|---------|-------------|-------|--------|----------|--------|-------|
| t_0001  | Do the thing | Bubble | 2026-05-23 | next session | open | A note. |
| t_0002  | Another task | Lara | 2026-06-01 | TBD | paused | Second note. |
`

describe('parseTeamIndex', () => {
  it('reads roster rows, ignoring the number and persona columns', () => {
    const rows = parseTeamIndex(TEAM_INDEX)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: 'Nadia', role: 'Your manager', lane: 'orchestration', status: 'active', hired: '2026-07-04' })
    expect(rows[1].name).toBe('Callum')
  })
  it('stops at the next section and does not read the capability line', () => {
    expect(parseTeamIndex(TEAM_INDEX).every(r => r.name !== '')).toBe(true)
  })
})

describe('parseTaskTable', () => {
  it('reads ledger rows and maps Deadline to due', () => {
    const rows = parseTaskTable(LEDGER)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id: 't_0001', title: 'Do the thing', owner: 'Bubble', opened: '2026-05-23', due: 'next session', status: 'open', notes: 'A note.' })
    expect(rows[1].status).toBe('paused')
  })
  it('returns no rows for an empty ledger (headers only)', () => {
    const empty = LEDGER.split('\n').slice(0, 9).join('\n') // through the separator, no data rows
    expect(parseTaskTable(empty)).toHaveLength(0)
  })
})

describe('parseSessionRefs', () => {
  it('sorts newest first and extracts date and title, ignoring non-md files', () => {
    const refs = parseSessionRefs([
      '2026-06-30_session_004.md',
      '2026-07-04_session_006.md',
      'notes.txt',
      '2026-05-23_session_001.md',
    ])
    expect(refs).toHaveLength(3)
    expect(refs[0].fileName).toBe('2026-07-04_session_006.md')
    expect(refs[0].date).toBe('2026-07-04')
    expect(refs[0].title).toBe('session 006')
  })
})

describe('joinPath', () => {
  it('joins with forward slashes and trims a trailing separator', () => {
    expect(joinPath('C:\\vault\\', '8. Agents', 'ai_team_root')).toBe('C:\\vault/8. Agents/ai_team_root')
    expect(joinPath('/home/vault', 'bkm', 'sessions')).toBe('/home/vault/bkm/sessions')
  })
})

describe('rosterDrifted', () => {
  it('detects a differing name set', () => {
    const file = parseTeamIndex(TEAM_INDEX)
    expect(rosterDrifted(['Nadia', 'Callum'], file)).toBe(false)
    expect(rosterDrifted(['Nadia', 'Callum', 'Sasha'], file)).toBe(true)
  })
})

describe('buildSessionEntry', () => {
  const entry = buildSessionEntry({
    runId: 'run-123',
    date: '2026-07-04',
    brief: 'Summarise the Q2 review',
    title: 'Summarise the Q2 review',
    feed: [
      { agentName: 'Nadia', text: 'Routing to the writer.', type: 'routing' },
      { agentName: 'Callum', text: 'Reading the folder.', type: 'read' },
      { agentName: 'Nadia', text: 'Done. Saved the file.', type: 'complete' },
    ],
    deliverablePath: '/vault/8. Agents/ai_team_root/6. Outputs/drafts/written/q2.md',
  })
  it('uses the live session-log shape', () => {
    expect(entry).toContain('type: Session Log')
    expect(entry).toContain('## Decisions')
    expect(entry).toContain('## Actions taken')
    expect(entry).toContain('## Tasks opened')
    expect(entry).toContain('## Tasks closed')
  })
  it('lists involved agents and the deliverable path, not routing-only steps', () => {
    expect(entry).toContain('agents_involved: Nadia, Callum')
    expect(entry).toContain('- Deliverable written to /vault/8. Agents/ai_team_root/6. Outputs/drafts/written/q2.md')
    expect(entry).toContain('- Reading the folder.')
    expect(entry).not.toContain('- Routing to the writer.')
  })
})

describe('updateRosterInTeamIndex', () => {
  it('replaces the roster rows and bumps last_updated, preserving the rest', () => {
    const out = updateRosterInTeamIndex(TEAM_INDEX, [
      { name: 'Nadia', role: 'Your manager', lane: 'orchestration', status: 'active', hired: '2026-07-04' },
      { name: 'Callum', role: 'Writes things', lane: 'writing', status: 'active', hired: '2026-07-04' },
      { name: 'Sasha', role: 'Researcher', lane: 'research', status: 'active', hired: '2026-07-05' },
    ], '2026-07-05')
    expect(out).toContain('last_updated: 2026-07-05')
    expect(out).toContain('| 3 | Sasha | Researcher | research | in-app agent | active | 2026-07-05 |')
    expect(out).toContain('## Capability summary')
    // Re-parsing the rewritten file yields the new roster.
    expect(parseTeamIndex(out)).toHaveLength(3)
  })
})
