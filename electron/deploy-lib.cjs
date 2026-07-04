// Pure deploy engine for the operating-system scaffold. No electron dependency,
// so it is unit-testable and can be exercised from a plain Node script. The IPC
// wrapper (deploy.cjs) supplies the app version, userData paths, and grant
// checks; everything filesystem-shaped lives here.

const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')

const AGENT_REL = path.join('8. Agents', 'ai_team_root')

// Replace {{TOKEN}} placeholders. Unknown tokens are left intact so a typo in a
// template surfaces visibly rather than silently blanking.
function subst(content, vars) {
  return String(content).replace(/\{\{(\w+)\}\}/g, (_m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{{${k}}}`
  )
}

// Build the roster table body from the rows the renderer passes. The persona
// column is fixed to "in-app agent": no Claude persona files are deployed.
function rosterRows(roster) {
  const rows = Array.isArray(roster) ? roster : []
  if (!rows.length) return '| 1 | (your team) |  |  | in-app agent | active |  |'
  return rows
    .map((r, i) =>
      `| ${i + 1} | ${r.name || ''} | ${r.role || ''} | ${r.lane || ''} | in-app agent | ${r.status || 'active'} | ${r.hired || ''} |`
    )
    .join('\n')
}

// Assemble the substitution variables. date and appVersion are injected so this
// stays free of electron and of wall-clock non-determinism in tests.
function buildVars({ ownerName, roster, appVersion, date }) {
  return {
    DATE: date || new Date().toISOString().slice(0, 10),
    APP_VERSION: appVersion || 'unknown',
    OWNER_NAME: (ownerName && String(ownerName).trim()) || 'Owner',
    ROSTER_ROWS: rosterRows(roster),
    ROSTER_COUNT: String(Array.isArray(roster) ? roster.length : 0),
  }
}

function loadManifest(templateDir) {
  return JSON.parse(fs.readFileSync(path.join(templateDir, 'manifest.json'), 'utf8'))
}

// Classify every planned dir and file as create (missing) or keep (present).
function planEntries(root, manifest) {
  const entries = []
  for (const rel of manifest.dirs) {
    entries.push({ relPath: rel, kind: 'dir', action: fs.existsSync(path.join(root, rel)) ? 'keep' : 'create' })
  }
  for (const f of manifest.files) {
    entries.push({ relPath: f.path, kind: 'file', action: fs.existsSync(path.join(root, f.path)) ? 'keep' : 'create' })
  }
  return entries
}

// Warn if the chosen root sits inside an existing vault (pillar markers in an
// ancestor directory), so the user does not create a nested operating system.
function nestedVaultWarnings(root) {
  const warnings = []
  const markers = ['8. Agents', '0. Inbox', '1. Projects']
  let dir = path.dirname(path.resolve(root))
  for (let i = 0; i < 4; i++) {
    let hits = 0
    for (const m of markers) {
      try { if (fs.existsSync(path.join(dir, m))) hits++ } catch { /* ignore */ }
    }
    if (hits >= 2) {
      warnings.push(`The chosen folder appears to sit inside an existing vault at ${dir}. Deploying here would create a nested operating system.`)
      break
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return warnings
}

// Apply the scaffold. Transactional per file: directories first, then files
// written with the wx flag so an existing file is never truncated, even under a
// race. An existing path is counted as kept, never as an error (this also
// covers case-insensitive-filesystem collisions).
async function applyDeploy({ root, templateDir, manifest, vars }) {
  const result = { created: 0, kept: 0, errors: [], createdPaths: [] }

  for (const rel of manifest.dirs) {
    const abs = path.join(root, rel)
    try {
      if (fs.existsSync(abs)) { result.kept++; continue }
      await fsp.mkdir(abs, { recursive: true })
      result.created++
      result.createdPaths.push(rel)
    } catch (err) {
      result.errors.push(`${rel}: ${errText(err)}`)
    }
  }

  for (const f of manifest.files) {
    const abs = path.join(root, f.path)
    try {
      await fsp.mkdir(path.dirname(abs), { recursive: true })
      const tpl = await fsp.readFile(path.join(templateDir, f.src), 'utf8')
      await fsp.writeFile(abs, subst(tpl, vars), { encoding: 'utf8', flag: 'wx' })
      result.created++
      result.createdPaths.push(f.path)
    } catch (err) {
      if (err && err.code === 'EEXIST') result.kept++
      else result.errors.push(`${f.path}: ${errText(err)}`)
    }
  }

  return result
}

// Append a provenance record to the deploy log. Best effort: a log failure never
// fails the deploy, and the log is not an idempotence gate (disk existence is).
async function appendDeployLog(root, entry) {
  const logPath = path.join(root, AGENT_REL, 'bkm', 'deploy_log.json')
  try {
    let log = []
    try {
      const parsed = JSON.parse(await fsp.readFile(logPath, 'utf8'))
      if (Array.isArray(parsed)) log = parsed
    } catch { /* no existing log */ }
    log.push(entry)
    await fsp.writeFile(logPath, JSON.stringify(log, null, 2), 'utf8')
  } catch { /* ignore */ }
}

function errText(err) {
  return String((err && err.message) || err)
}

module.exports = {
  AGENT_REL,
  subst,
  rosterRows,
  buildVars,
  loadManifest,
  planEntries,
  nestedVaultWarnings,
  applyDeploy,
  appendDeployLog,
}
