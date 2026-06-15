const { app, BrowserWindow, ipcMain, dialog, Notification, shell, session } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const fsSync = require('fs')
const crypto = require('crypto')
const { registerAgentIpc } = require('./agent.cjs')
const { grantRoot, isWithinGrant } = require('./grants.cjs')

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
const DEV_URL = 'http://localhost:5173'

// Guardrails for real filesystem access.
const MAX_ENTRIES = 500
const MAX_READ_BYTES = 256 * 1024 // 256 KB preview cap

function errMessage(err) {
  return String((err && err.message) || err)
}

// Build a strict Content-Security-Policy for the production renderer. Inline
// scripts in the shipped index.html (the pre-paint theme bootstrap) are allowed
// by hashing them from the actual file, so script-src needs no 'unsafe-inline'
// and the hash can never drift from the build. The renderer makes no direct
// network requests (everything goes through IPC), so connect-src stays 'self'.
function buildCsp() {
  const hashes = []
  try {
    const html = fsSync.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8')
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi
    let m
    while ((m = re.exec(html))) {
      hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`)
    }
  } catch { /* no inline scripts to hash */ }
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'", // Tailwind may inject style tags; element styles are set via CSSOM and unaffected
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ')
}

// Register filesystem IPC once (handlers are global, not per-window).
function registerFileIpc(getWindow) {
  // Native directory picker. A successful pick is the only way a folder becomes
  // authorised for later read/write.
  ipcMain.handle('folders:pick', async () => {
    const parent = getWindow()
    const opts = { properties: ['openDirectory', 'createDirectory'] }
    const res = parent
      ? await dialog.showOpenDialog(parent, opts)
      : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths.length) return { canceled: true }
    grantRoot(res.filePaths[0])
    return { canceled: false, path: res.filePaths[0] }
  })

  // Shallow directory listing.
  ipcMain.handle('folders:list', async (_e, dirPath) => {
    if (!isWithinGrant(dirPath)) return { ok: false, error: 'Folder is not authorised. Reconnect it from Folders.' }
    try {
      const dirents = await fs.readdir(dirPath, { withFileTypes: true })
      const entries = []
      for (const d of dirents.slice(0, MAX_ENTRIES)) {
        let size = 0
        if (d.isFile()) {
          try { size = (await fs.stat(path.join(dirPath, d.name))).size } catch { /* skip */ }
        }
        entries.push({ name: d.name, isDirectory: d.isDirectory(), size })
      }
      return { ok: true, entries }
    } catch (err) {
      return { ok: false, error: errMessage(err) }
    }
  })

  // Read a single text file (size-capped).
  ipcMain.handle('folders:read', async (_e, filePath) => {
    if (!isWithinGrant(filePath)) return { ok: false, error: 'Refusing to read outside an authorised folder.' }
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_READ_BYTES) return { ok: false, error: 'File is too large to preview.' }
      const content = await fs.readFile(filePath, 'utf8')
      return { ok: true, content }
    } catch (err) {
      return { ok: false, error: errMessage(err) }
    }
  })

  // Write a file into a connected folder. The filename is sanitised and the
  // resolved path is confirmed to stay inside the connected folder.
  ipcMain.handle('folders:write', async (_e, { folderPath, name, content }) => {
    try {
      if (!isWithinGrant(folderPath)) return { ok: false, error: 'Folder is not authorised. Reconnect it from Folders.' }
      const safe = path.basename(String(name || '').trim())
      if (!safe || safe === '.' || safe === '..') return { ok: false, error: 'Invalid file name.' }
      const root = path.resolve(folderPath)
      const target = path.resolve(root, safe)
      if (target !== root && !target.startsWith(root + path.sep)) {
        return { ok: false, error: 'Refusing to write outside the connected folder.' }
      }
      await fs.writeFile(target, String(content ?? ''), 'utf8')
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: errMessage(err) }
    }
  })
}

let mainWindow = null

// Window-control IPC is registered once (not per-window): re-running it on a
// second createWindow would throw on the ipcMain.handle channel and stack the
// ipcMain.on listeners. Each handler resolves the window from its sender.
function registerWindowIpc() {
  ipcMain.on('window-minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window-toggle-maximize', e => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('window-close', e => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('window-is-maximized', e => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#1A1922', // near-black fallback avoids white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('maximize', () => win.webContents.send('window-maximized-change', true))
  win.on('unmaximize', () => win.webContents.send('window-maximized-change', false))

  // Navigation guard: this app is a fixed local UI. Deny in-app navigation away
  // from it, and never open child windows in-process; route external http(s)
  // links to the system browser instead.
  const allowed = isDev ? DEV_URL : 'file://'
  const blockNav = (e, url) => { if (!url.startsWith(allowed)) e.preventDefault() }
  win.webContents.on('will-navigate', blockNav)
  win.webContents.on('will-redirect', blockNav)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => win.show())

  mainWindow = win
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.icor.ai-staff')

  // Enforce CSP on the packaged app. Skipped in dev, where Vite serves its own
  // assets and HMR needs an inline/eval-friendly policy.
  if (!isDev) {
    const csp = buildCsp()
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
    })
  }

  // Defence in depth: this app has exactly one trusted frame. Refuse to attach
  // webviews and deny any child-window creation on every web contents, so IPC
  // can only ever come from our own renderer.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', e => e.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
  ipcMain.handle('notify', (_e, { title, body }) => {
    try {
      if (Notification.isSupported()) {
        new Notification({ title: String(title || 'Your AI Staff'), body: String(body || '') }).show()
      }
    } catch { /* ignore */ }
    return { ok: true }
  })
  registerWindowIpc()
  registerFileIpc(() => mainWindow)
  registerAgentIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
