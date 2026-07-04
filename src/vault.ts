// Pure parsers and helpers for the Operating System (vault) view. These read the
// deployed vault's Markdown files (team_index.md, open.md) and session listings
// into typed rows. No IPC here: the view fetches raw text/listings through the
// existing folders:* channels and hands them to these functions. Kept pure so
// they are unit-tested against the real file formats.

import type { VaultRosterRow, VaultTaskRow, VaultSessionRef } from './data/types'

// Split a Markdown table row into trimmed cells, dropping the outer pipes.
function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every(c => c === '' || /^:?-+:?$/.test(c))
}

// Parse the "Active roster" table. Columns: # | Name | Role | Lane | Persona
// file | Status | Hired. The number and persona columns are ignored.
export function parseTeamIndex(md: string): VaultRosterRow[] {
  const rows: VaultRosterRow[] = []
  let inTable = false
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('|')) { if (inTable) break; continue }
    const cells = splitRow(line)
    if (!inTable) {
      const lower = cells.map(c => c.toLowerCase())
      if (lower.includes('name') && lower.includes('role') && lower.includes('lane')) inTable = true
      continue
    }
    if (isSeparatorRow(cells)) continue
    if (cells.length >= 6) {
      const [, name, role, lane, , status, hired] = cells
      if (name) rows.push({ name, role: role || '', lane: lane || '', status: status || '', hired: hired || '' })
    }
  }
  return rows
}

// Parse the open-tasks ledger table. Columns (real headers): Task ID |
// Description | Owner | Opened | Deadline | Status | Notes. Deadline maps to due.
export function parseTaskTable(md: string): VaultTaskRow[] {
  const rows: VaultTaskRow[] = []
  let inTable = false
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('|')) { if (inTable) break; continue }
    const cells = splitRow(line)
    if (!inTable) {
      const lower = cells.map(c => c.toLowerCase())
      if (lower.includes('task id') && lower.includes('description')) inTable = true
      continue
    }
    if (isSeparatorRow(cells)) continue
    if (cells.length >= 6) {
      const [id, title, owner, opened, due, status, notes] = cells
      if (id) rows.push({ id, title: title || '', owner: owner || '', opened: opened || '', due: due || '', status: status || '', notes: notes || '' })
    }
  }
  return rows
}

// Turn a session-folder listing into dated, titled refs, newest first. The
// caller supplies filenames from folders:list (capped at 500 entries in readdir
// order, so for a vault with more than 500 session files the newest may fall
// outside the window; this sorts what it is given).
export function parseSessionRefs(fileNames: string[]): VaultSessionRef[] {
  const refs = fileNames
    .filter(n => n.toLowerCase().endsWith('.md'))
    .map(fileName => {
      const base = fileName.replace(/\.md$/i, '')
      const m = base.match(/^(\d{4}-\d{2}-\d{2})[_-]?(.*)$/)
      const date = m ? m[1] : ''
      const title = ((m ? m[2] : base).replace(/[_-]+/g, ' ').trim()) || base
      return { fileName, date, title }
    })
  refs.sort((a, b) => b.date.localeCompare(a.date) || b.fileName.localeCompare(a.fileName))
  return refs
}

// Join an absolute base with child segments using forward slashes. The main
// process resolves the path (path.resolve), which normalises separators on both
// Windows and POSIX, so a forward-slash join is safe cross-platform.
export function joinPath(base: string, ...parts: string[]): string {
  return [base.replace(/[\\/]+$/, ''), ...parts].join('/')
}

// Format roster rows for team_index.md. The persona column is fixed to "in-app
// agent" (no persona files are deployed), matching the deploy engine.
export function rosterTableRows(roster: VaultRosterRow[]): string {
  if (!roster.length) return '| 1 | (your team) |  |  | in-app agent | active |  |'
  return roster
    .map((r, i) => `| ${i + 1} | ${r.name} | ${r.role} | ${r.lane} | in-app agent | ${r.status} | ${r.hired} |`)
    .join('\n')
}

// True if the app roster and the deployed roster differ by name set, so the view
// can offer a gated regenerate.
export function rosterDrifted(appNames: string[], fileRoster: VaultRosterRow[]): boolean {
  const a = [...appNames].map(s => s.trim()).filter(Boolean).sort()
  const b = fileRoster.map(r => r.name.trim()).filter(Boolean).sort()
  if (a.length !== b.length) return true
  return a.some((n, i) => n !== b[i])
}

// Rewrite the roster table in an existing team_index.md, preserving everything
// else and bumping last_updated. Used by the gated "update vault roster" action.
export function updateRosterInTeamIndex(existing: string, roster: VaultRosterRow[], date: string): string {
  const lines = existing.split(/\r?\n/).map(l => (/^last_updated:/.test(l.trim()) ? `last_updated: ${date}` : l))
  const headerIdx = lines.findIndex(l => {
    const t = l.trim()
    if (!t.startsWith('|')) return false
    const lower = splitRow(t).map(c => c.toLowerCase())
    return lower.includes('name') && lower.includes('role') && lower.includes('lane')
  })
  if (headerIdx === -1) return lines.join('\n')
  const start = headerIdx + 2 // header row + separator row
  let end = start
  while (end < lines.length && lines[end].trim().startsWith('|')) end++
  const newRows = rosterTableRows(roster).split('\n')
  return [...lines.slice(0, start), ...newRows, ...lines.slice(end)].join('\n')
}
