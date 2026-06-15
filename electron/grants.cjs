// Folder grant registry. The native directory picker is the ONLY way a path is
// authorised; every filesystem operation (list, read, write, and the agent's
// own file tools) must resolve inside a granted root. This contains a renderer
// compromise to folders the user has explicitly chosen, rather than the whole
// disk.
//
// Grants persist in userData so authorisations survive restarts. Folders
// connected in a build that predates this registry must be reconnected once
// (re-picked) before they can be read again.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')

function grantsPath() { return path.join(app.getPath('userData'), 'granted-folders.json') }

let roots = null
function load() {
  try {
    const arr = JSON.parse(fs.readFileSync(grantsPath(), 'utf8'))
    return Array.isArray(arr) ? arr.map(p => path.resolve(String(p))) : []
  } catch { return [] }
}
function getRoots() {
  if (!roots) roots = load()
  return roots
}
function save() {
  try { fs.writeFileSync(grantsPath(), JSON.stringify(getRoots()), 'utf8') } catch { /* ignore */ }
}

// Authorise a directory the user picked. Returns the resolved path.
function grantRoot(p) {
  const r = path.resolve(String(p))
  const list = getRoots()
  if (!list.includes(r)) { list.push(r); save() }
  return r
}

// True if `target` is a granted root or sits inside one. `target` is resolved
// first, so traversal that escapes a root fails the containment check.
function isWithinGrant(target) {
  if (!target) return false
  const t = path.resolve(String(target))
  return getRoots().some(root => t === root || t.startsWith(root + path.sep))
}

module.exports = { grantRoot, isWithinGrant, getRoots }
