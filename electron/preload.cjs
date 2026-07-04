const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Host platform (process.platform), so the renderer can adapt its chrome
  // (e.g. macOS traffic lights versus Windows-style controls in TitleBar).
  platform: process.platform,

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (cb) => {
    const handler = (_event, value) => cb(value)
    ipcRenderer.on('window-maximized-change', handler)
    return () => ipcRenderer.removeListener('window-maximized-change', handler)
  },

  // Real filesystem access. All work happens in the main process; the renderer
  // only ever sees folders the user has explicitly picked.
  pickFolder: () => ipcRenderer.invoke('folders:pick'),
  listFolder: (path) => ipcRenderer.invoke('folders:list', path),
  readFile: (path) => ipcRenderer.invoke('folders:read', path),
  writeFile: (folderPath, name, content) =>
    ipcRenderer.invoke('folders:write', { folderPath, name, content }),

  // AI connection (secure key storage; all model calls run in the main process)
  configStatus: () => ipcRenderer.invoke('config:status'),
  setProviderKey: (provider, apiKey) => ipcRenderer.invoke('config:setProviderKey', { provider, apiKey }),
  setLocalBaseUrl: (baseUrl) => ipcRenderer.invoke('config:setLocalBaseUrl', { baseUrl }),
  setRoleModel: (role, provider, model) => ipcRenderer.invoke('config:setRoleModel', { role, provider, model }),
  setMcpServer: (server) => ipcRenderer.invoke('config:setMcpServer', server),
  removeMcpServer: (id) => ipcRenderer.invoke('config:removeMcpServer', { id }),
  testMcpServer: (id) => ipcRenderer.invoke('mcp:test', { id }),
  authorizeMcpServer: (id) => ipcRenderer.invoke('mcp:authorize', { id }),
  listModels: (provider) => ipcRenderer.invoke('models:list', { provider }),
  runOrchestrator: (brief, folders, team) => ipcRenderer.invoke('agent:runOrchestrator', { brief, folders, team }),
  reviewAndWrite: (brief, draft, folders) => ipcRenderer.invoke('agent:reviewAndWrite', { brief, draft, folders }),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // Operating-system deploy and vault pointer.
  deployPlan: (root) => ipcRenderer.invoke('deploy:plan', { root }),
  deployApply: (root, ownerName, roster) => ipcRenderer.invoke('deploy:apply', { root, ownerName, roster }),
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  setVaultRoot: (root) => ipcRenderer.invoke('vault:setRoot', { root }),
  onAgentEvent: (cb) => {
    const handler = (_event, payload) => cb(payload)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
})
