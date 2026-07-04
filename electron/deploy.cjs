// Deploy engine IPC. Scaffolds the ICOR-style operating system into a
// user-chosen, already-granted folder, and owns the vault pointer (vault.json in
// userData). All filesystem logic lives in the electron-free deploy-lib.cjs; this
// module supplies the app version, userData paths, and the grant check, and wires
// the IPC channels. Naming follows the existing conventions (deploy:*, vault:*).

const { app, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { isWithinGrant } = require('./grants.cjs')
const lib = require('./deploy-lib.cjs')

const TEMPLATE_DIR = path.join(__dirname, 'templates', 'vault')

function vaultConfigPath() { return path.join(app.getPath('userData'), 'vault.json') }

function readVaultConfig() {
  try { return JSON.parse(fs.readFileSync(vaultConfigPath(), 'utf8')) } catch { return null }
}
function writeVaultConfig(cfg) {
  try { fs.writeFileSync(vaultConfigPath(), JSON.stringify(cfg, null, 2), 'utf8'); return true } catch { return false }
}
function today() { return new Date().toISOString().slice(0, 10) }
function agentRootOf(root) { return path.join(root, lib.AGENT_REL) }

function registerDeployIpc() {
  // Dry run: classify every path as create or keep, plus any warnings.
  ipcMain.handle('deploy:plan', async (_e, { root } = {}) => {
    try {
      if (!root) return { root: '', entries: [], warnings: ['No folder chosen.'] }
      const resolved = path.resolve(String(root))
      if (!isWithinGrant(resolved)) {
        return { root: resolved, entries: [], warnings: ['This folder is not authorised. Pick it again to grant access.'] }
      }
      const manifest = lib.loadManifest(TEMPLATE_DIR)
      return { root: resolved, entries: lib.planEntries(resolved, manifest), warnings: lib.nestedVaultWarnings(resolved) }
    } catch (err) {
      return { root: String(root || ''), entries: [], warnings: [String((err && err.message) || err)] }
    }
  })

  // Execute the scaffold, then record the vault pointer.
  ipcMain.handle('deploy:apply', async (_e, { root, ownerName, roster } = {}) => {
    const result = { ok: false, created: 0, kept: 0, errors: [] }
    try {
      if (!root) { result.errors.push('No folder chosen.'); return result }
      const resolved = path.resolve(String(root))
      if (!isWithinGrant(resolved)) {
        result.errors.push('This folder is not authorised. Pick it again to grant access.')
        return result
      }
      const manifest = lib.loadManifest(TEMPLATE_DIR)
      const vars = lib.buildVars({ ownerName, roster, appVersion: app.getVersion(), date: today() })

      const applied = await lib.applyDeploy({ root: resolved, templateDir: TEMPLATE_DIR, manifest, vars })
      result.created = applied.created
      result.kept = applied.kept
      result.errors = applied.errors

      await lib.appendDeployLog(resolved, { when: new Date().toISOString(), appVersion: vars.APP_VERSION, created: applied.createdPaths })

      writeVaultConfig({ root: resolved, agentRoot: agentRootOf(resolved), deployedBy: vars.APP_VERSION, deployedAt: vars.DATE })

      result.ok = applied.errors.length === 0
      return result
    } catch (err) {
      result.errors.push(String((err && err.message) || err))
      return result
    }
  })

  // Vault pointer status, checked live against disk.
  ipcMain.handle('vault:status', async () => {
    const cfg = readVaultConfig()
    if (!cfg || !cfg.root) {
      return { configured: false, exists: false, hasTeamIndex: false, hasLedger: false, hasSessions: false }
    }
    const root = cfg.root
    const agentRoot = cfg.agentRoot || agentRootOf(root)
    return {
      configured: true,
      root,
      agentRoot,
      exists: fs.existsSync(root),
      hasTeamIndex: fs.existsSync(path.join(agentRoot, 'team', 'team_index.md')),
      hasLedger: fs.existsSync(path.join(agentRoot, 'bkm', 'tasks', 'open.md')),
      hasSessions: fs.existsSync(path.join(agentRoot, 'bkm', 'sessions')),
    }
  })

  // Point the app at an already-granted vault without deploying (adopt an
  // existing vault, for example Bubble's real one).
  ipcMain.handle('vault:setRoot', async (_e, { root } = {}) => {
    if (!root) return { ok: false, error: 'No folder chosen.' }
    const resolved = path.resolve(String(root))
    if (!isWithinGrant(resolved)) return { ok: false, error: 'This folder is not authorised. Pick it again to grant access.' }
    const ok = writeVaultConfig({ root: resolved, agentRoot: agentRootOf(resolved), deployedBy: app.getVersion(), deployedAt: today() })
    return ok ? { ok: true } : { ok: false, error: 'Could not record the vault location.' }
  })
}

module.exports = { registerDeployIpc }
