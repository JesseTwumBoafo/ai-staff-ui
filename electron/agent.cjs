// Real model wiring: secure credential storage, per-role model config, and a
// delegating multi-agent run (orchestrator -> parallel specialist sub-agents
// -> review/revise loop -> real write). All model calls and filesystem/web
// access run here in the main process; the renderer sees tagged events.

const { app, ipcMain, safeStorage, dialog, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const net = require('net')
const dns = require('dns').promises
const { runModel, listModels } = require('./providers.cjs')
const { authorizeServer, refreshAccess } = require('./mcp-oauth.cjs')
const { createMcpSession } = require('./mcp-client.cjs')
const { isWithinGrant } = require('./grants.cjs')

const MAX_READ_BYTES = 256 * 1024
const MAX_TOOL_RESULT_CHARS = 20000
const MAX_FETCH_CHARS = 4000
const MAX_FETCH_BYTES = 2 * 1024 * 1024 // stop downloading a page after 2 MB
const ORCHESTRATOR_MAX_TURNS = 6
const SUBAGENT_MAX_TURNS = 5
const REVIEW_ROUNDS = 2

const CORE_ROLES = ['orchestrator', 'researcher', 'writer', 'reviewer']
const DEFAULT_ROLE_MODELS = {
  orchestrator: { provider: 'anthropic', model: 'claude-opus-4-8' },
  researcher: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  writer: { provider: 'anthropic', model: 'claude-opus-4-8' },
  reviewer: { provider: 'anthropic', model: 'claude-haiku-4-5' },
}
const FALLBACK_ROLE_MODEL = { provider: 'anthropic', model: 'claude-haiku-4-5' }

let activeController = null

// Strip anything that looks like a credential before an error string is shown
// in the UI or fed back to a model. Provider/MCP error bodies occasionally echo
// request detail; this keeps keys and bearer tokens out of those surfaces.
function redactSecrets(str) {
  return String(str)
    .replace(/\b(sk-[A-Za-z0-9_-]{6,})/g, 'sk-***')
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, 'AIza***')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***')
    .replace(/\b(api[-_]?key["'\s:=]+)[A-Za-z0-9._-]{6,}/gi, '$1***')
}
function errMessage(err) { return redactSecrets(String((err && err.message) || err)) }
function isAbort(err, signal) {
  return (signal && signal.aborted) || (err && (err.name === 'AbortError' || err.name === 'APIUserAbortError'))
}
function newUsage() { return { input: 0, output: 0, models: {} } }
function addUsage(acc, u, roleModel) {
  if (!u) return
  acc.input += u.input || 0
  acc.output += u.output || 0
  if (roleModel && roleModel.model) {
    const m = acc.models[roleModel.model] || (acc.models[roleModel.model] = { provider: roleModel.provider, input: 0, output: 0 })
    m.input += u.input || 0
    m.output += u.output || 0
  }
}
function textOf(content) { return content.filter(b => b.type === 'text').map(b => b.text).join('').trim() }

// --- Config ------------------------------------------------------------------

function configPath() { return path.join(app.getPath('userData'), 'ai-connection.json') }
function readConfig() { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')) } catch { return {} } }
function writeConfig(obj) {
  // Owner-only permissions: the file holds encrypted secrets, but defence in
  // depth keeps it unreadable by other accounts on POSIX. (Windows ACLs already
  // scope userData per user; chmod is a harmless no-op there.)
  fs.writeFileSync(configPath(), JSON.stringify(obj), { encoding: 'utf8', mode: 0o600 })
  try { fs.chmodSync(configPath(), 0o600) } catch { /* ignore */ }
}

// Refuse to persist secrets as plaintext. Base64 is not encryption, so if the
// OS has no secure store available we fail loudly rather than writing keys and
// tokens in the clear. Callers surface the thrown message to the user.
function encodeSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable on this system, so the secret was not saved.')
  }
  const buf = safeStorage.encryptString(value)
  return { encryptedKey: buf.toString('base64'), encrypted: true }
}
function decodeSecret(entry) {
  if (!entry || !entry.encryptedKey) return null
  try {
    const buf = Buffer.from(entry.encryptedKey, 'base64')
    if (entry.encrypted && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf)
    return buf.toString('utf8')
  } catch { return null }
}

function getRoleModels() {
  const cfg = readConfig()
  return { ...DEFAULT_ROLE_MODELS, ...(cfg.roleModels || {}) }
}
function roleModelFor(role) {
  return getRoleModels()[role] || DEFAULT_ROLE_MODELS[role] || FALLBACK_ROLE_MODEL
}
function credsFor(provider) {
  const providers = readConfig().providers || {}
  if (provider === 'local') {
    return { baseUrl: (providers.local && providers.local.baseUrl) || 'http://localhost:11434/v1', apiKey: undefined }
  }
  const apiKey = decodeSecret(providers[provider])
  return { apiKey: apiKey || undefined }
}
function providerConfigured(provider) {
  if (provider === 'local') return true
  return !!decodeSecret((readConfig().providers || {})[provider])
}

// --- MCP servers (remote URL, applied to Anthropic roles via the connector) --

function getMcpServers() {
  const cfg = readConfig()
  return Array.isArray(cfg.mcpServers) ? cfg.mcpServers : []
}
function authStateOf(s) {
  if (s.oauth && s.oauth.accessToken) return 'oauth'
  if (s.token && s.token.encryptedKey) return 'token'
  return 'none'
}
function mcpServersSanitised() {
  return getMcpServers().map(s => ({
    id: s.id, name: s.name, transport: s.transport || 'url',
    url: s.url || '', command: s.command || '', args: (s.args || []).join(' '),
    hasToken: !!(s.token && s.token.encryptedKey), authState: authStateOf(s),
  }))
}
function persistMcpServer(updated) {
  const cfg = readConfig()
  cfg.mcpServers = getMcpServers().map(s => (s.id === updated.id ? updated : s))
  writeConfig(cfg)
}

// Resolve server configs (refreshing OAuth tokens) for the MCP client.
async function resolveMcpConfigs() {
  const out = []
  for (const s of getMcpServers()) {
    const cfg = { id: s.id, name: s.name, transport: s.transport || 'url', url: s.url, command: s.command, args: s.args, env: s.env }
    let token = null
    if (s.oauth && s.oauth.accessToken) {
      token = decodeSecret(s.oauth.accessToken)
      const expired = s.oauth.expiresAt && s.oauth.expiresAt < Date.now() + 60000
      if (expired && s.oauth.refreshToken) {
        try {
          const refreshTok = decodeSecret(s.oauth.refreshToken)
          const next = await refreshAccess({ tokenEndpoint: s.oauth.tokenEndpoint, clientId: s.oauth.clientId, refreshToken: refreshTok })
          persistMcpServer({
            ...s,
            oauth: {
              clientId: s.oauth.clientId, tokenEndpoint: s.oauth.tokenEndpoint,
              accessToken: encodeSecret(next.accessToken),
              refreshToken: next.refreshToken ? encodeSecret(next.refreshToken) : s.oauth.refreshToken,
              expiresAt: next.expiresAt,
            },
          })
          token = next.accessToken
        } catch { /* fall through with current token */ }
      }
    } else if (s.token) {
      token = decodeSecret(s.token)
    }
    if (token) cfg.token = token
    out.push(cfg)
  }
  return out
}

// --- Tools (folders + web), scoped and guarded -------------------------------

function connectedOnly(folders) { return (folders || []).filter(f => f && f.connected && f.path) }
function findFolder(folders, name) {
  const byName = folders.find(f => f.name === name || f.name.toLowerCase() === String(name || '').toLowerCase())
  return byName || folders[0] || null
}

const USER_AGENT = 'Mozilla/5.0 (compatible; YourAIStaff/1.0)'

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Combine the run's abort signal with a per-request timeout.
function timeoutSignal(signal, ms) {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

async function webSearch(query, signal) {
  let html
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': USER_AGENT }, signal: timeoutSignal(signal, 15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    if (signal && signal.aborted) throw e
    return webSearchFallback(query, signal)
  }
  const titles = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  const snippets = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map(m => stripHtml(m[1]))
  const out = []
  for (let i = 0; i < titles.length && out.length < 6; i++) {
    let href = titles[i][1]
    const uddg = href.match(/uddg=([^&]+)/)
    if (uddg) { try { href = decodeURIComponent(uddg[1]) } catch { /* keep */ } }
    const title = stripHtml(titles[i][2])
    if (!title) continue
    out.push(`${out.length + 1}. ${title}\n   ${href}${snippets[i] ? `\n   ${snippets[i]}` : ''}`)
  }
  if (out.length) return out.join('\n\n')
  return webSearchFallback(query, signal)
}

async function webSearchFallback(query, signal) {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`, { headers: { 'User-Agent': USER_AGENT }, signal: timeoutSignal(signal, 12000) })
    if (!res.ok) return `Search failed (HTTP ${res.status}).`
    const data = await res.json()
    const parts = []
    if (data.AbstractText) parts.push(`${data.AbstractText}${data.AbstractURL ? `\n   ${data.AbstractURL}` : ''}`)
    for (const t of (data.RelatedTopics || []).slice(0, 6)) {
      if (t && t.Text) parts.push(`${t.Text}${t.FirstURL ? `\n   ${t.FirstURL}` : ''}`)
    }
    return parts.length ? parts.join('\n\n') : 'No results found.'
  } catch (e) {
    if (signal && signal.aborted) throw e
    return `Search failed: ${errMessage(e)}`
  }
}

// --- SSRF guard --------------------------------------------------------------
// web_fetch URLs are model-controlled and can be steered by prompt injection in
// web/file content. Block non-http(s) schemes and any address that resolves
// into a private, loopback, link-local (incl. 169.254.169.254 cloud metadata)
// or reserved range, so the tool cannot be turned against the local machine or
// the LAN. Residual: DNS rebinding between this check and the fetch is not
// fully closed by Node's fetch; the timeout and char cap bound the blast radius.

function v4IsBlocked(ip) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 0 || a === 10 || a === 127) return true            // this-network, private, loopback
  if (a === 169 && b === 254) return true                       // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true              // private
  if (a === 192 && b === 168) return true                       // private
  if (a === 100 && b >= 64 && b <= 127) return true             // CGNAT
  if (a === 192 && b === 0 && p[2] === 0) return true           // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true          // benchmarking
  if (a >= 224) return true                                     // multicast / reserved
  return false
}

function ipIsBlocked(ip) {
  const addr = ip.split('%')[0]
  if (net.isIPv4(addr)) return v4IsBlocked(addr)
  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (/^fe[89ab]/.test(lower)) return true                    // fe80::/10 link-local
    if (/^f[cd]/.test(lower)) return true                       // fc00::/7 unique-local
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)  // IPv4-mapped
    if (mapped) return v4IsBlocked(mapped[1])
    return false
  }
  return true // unrecognised: block
}

async function assertPublicUrl(raw) {
  let u
  try { u = new URL(raw) } catch { throw new Error('invalid URL') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http and https are allowed')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/^localhost$/i.test(host) || /\.localhost$/i.test(host)) throw new Error('refusing to fetch a local address')
  if (net.isIP(host)) {
    if (ipIsBlocked(host)) throw new Error('refusing to fetch a private or reserved address')
    return
  }
  let addrs
  try { addrs = await dns.lookup(host, { all: true }) } catch { throw new Error('could not resolve host') }
  if (!addrs.length || addrs.some(a => ipIsBlocked(a.address))) throw new Error('refusing to fetch a private or reserved address')
}

// Read a response body as text, but stop once maxBytes have arrived, so a huge
// (or hostile) page cannot exhaust memory. Decodes UTF-8 across chunk
// boundaries; cancels the stream when the cap is hit.
async function readBodyCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    return (await res.text()).slice(0, maxBytes)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let text = ''
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    text += decoder.decode(value, { stream: true })
    if (total >= maxBytes) { try { await reader.cancel() } catch { /* ignore */ } break }
  }
  text += decoder.decode()
  return text
}

async function webFetch(url, signal) {
  try {
    try { await assertPublicUrl(url) } catch (e) { return `Fetch blocked: ${errMessage(e)}.` }
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: timeoutSignal(signal, 15000) })
    if (!res.ok) return `Fetch failed (HTTP ${res.status}).`
    const ct = res.headers.get('content-type') || ''
    const body = await readBodyCapped(res, MAX_FETCH_BYTES)
    const text = ct.includes('html') || /^\s*</.test(body) ? stripHtml(body) : body
    return text.slice(0, MAX_FETCH_CHARS)
  } catch (e) {
    if (signal && signal.aborted) throw e
    return `Fetch failed: ${errMessage(e)}`
  }
}

async function execTool(name, input, folders, signal) {
  if (name === 'list_folder') {
    const fld = findFolder(folders, input.folder)
    if (!fld) return 'No connected folder by that name.'
    if (!isWithinGrant(fld.path)) return 'That folder is not authorised. Reconnect it from Folders.'
    const entries = await fs.promises.readdir(fld.path, { withFileTypes: true })
    const lines = entries.slice(0, 500).map(d => (d.isDirectory() ? `${d.name}/` : d.name))
    return lines.length ? lines.join('\n') : '(folder is empty)'
  }
  if (name === 'read_file') {
    const fld = findFolder(folders, input.folder)
    if (!fld) return 'No connected folder by that name.'
    if (!isWithinGrant(fld.path)) return 'That folder is not authorised. Reconnect it from Folders.'
    const safe = path.basename(String(input.file || ''))
    const root = path.resolve(fld.path)
    const target = path.resolve(root, safe)
    if (target !== root && !target.startsWith(root + path.sep)) return 'Refusing to read outside the connected folder.'
    const stat = await fs.promises.stat(target)
    if (stat.size > MAX_READ_BYTES) return 'File is too large to read.'
    return await fs.promises.readFile(target, 'utf8')
  }
  if (name === 'web_search') return webSearch(String(input.query || ''), signal)
  if (name === 'web_fetch') return webFetch(String(input.url || ''), signal)
  return 'Unknown tool.'
}

const FOLDER_TOOLS = [
  { name: 'list_folder', description: 'List the files in one of the user\'s connected folders.', input_schema: { type: 'object', properties: { folder: { type: 'string' } }, required: ['folder'] } },
  { name: 'read_file', description: 'Read a UTF-8 text file inside a connected folder.', input_schema: { type: 'object', properties: { folder: { type: 'string' }, file: { type: 'string' } }, required: ['folder', 'file'] } },
]
const WEB_TOOLS = [
  { name: 'web_search', description: 'Search the web and return the top results (title and URL).', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'web_fetch', description: 'Fetch a web page and return its readable text.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
]

function toolsForRole(role) {
  if (role === 'writer' || role === 'reviewer') return FOLDER_TOOLS
  // researcher and hired specialists get folder + web access
  return [...FOLDER_TOOLS, ...WEB_TOOLS]
}

const SUBAGENT_SYSTEM = {
  researcher: 'You are a researcher on a small team. Use list_folder and read_file for the user\'s connected folders, and web_search and web_fetch for anything online, then reply with a concise findings summary. British English, no em dashes.',
  writer: 'You are a writer on a small team. Draft the requested deliverable in Markdown, grounding it in the user\'s connected folders (use list_folder and read_file). Reply with the full draft only. British English, no em dashes.',
  reviewer: 'You are a reviewer on a small team. Assess the work for accuracy, tone and completeness, then reply with specific, actionable feedback. British English, no em dashes.',
}
function subAgentSystem(role, specialists) {
  if (SUBAGENT_SYSTEM[role]) return SUBAGENT_SYSTEM[role]
  const spec = specialists[role]
  if (spec) {
    const remit = Array.isArray(spec.whatIDo) && spec.whatIDo.length ? ` Your remit: ${spec.whatIDo.join('; ')}.` : ''
    return `You are ${spec.name}, ${spec.role}, on a small team.${remit} Use the available tools to gather what you need from the connected folders or the web, then reply with your result. British English, no em dashes.`
  }
  return 'You are a specialist on a small team. Complete the delegated subtask using the available tools, then reply with your result. British English, no em dashes.'
}

// --- Sub-agent ---------------------------------------------------------------

async function runSubAgent({ role, task, folders, send, signal, specialists, usage, subId, mcp }) {
  const roleModel = roleModelFor(role)
  const creds = credsFor(roleModel.provider)
  const tools = mcp && mcp.tools.length ? [...toolsForRole(role), ...mcp.tools] : toolsForRole(role)
  const transcript = [
    { kind: 'meta', label: 'Model', body: `${roleModel.provider} / ${roleModel.model}` },
    { kind: 'task', label: 'Task', body: task },
  ]
  const flush = () => send({ type: 'transcript', agentId: role, level: 'subagent', subId, transcript, text: '' })
  send({ type: 'routing', agentId: role, level: 'subagent', subId, text: `On it: ${task}` })

  const messages = [{ role: 'user', content: task }]
  let finalText = ''
  for (let i = 0; i < SUBAGENT_MAX_TURNS; i++) {
    if (signal && signal.aborted) break
    let resp
    try {
      resp = await runModel({ roleModel, creds, system: subAgentSystem(role, specialists), messages, tools, signal })
    } catch (err) {
      if (isAbort(err, signal)) { flush(); return '(stopped)' }
      send({ type: 'error', agentId: role, level: 'subagent', text: `Error: ${errMessage(err)}` })
      transcript.push({ kind: 'result', label: 'Error', body: errMessage(err) })
      flush()
      return `Could not complete the subtask: ${errMessage(err)}`
    }
    addUsage(usage, resp.usage, roleModel)

    const toolResults = []
    for (const block of resp.content) {
      if (block.type === 'text' && block.text.trim()) {
        finalText = block.text.trim()
        send({ type: 'text', agentId: role, level: 'subagent', text: finalText })
        transcript.push({ kind: 'text', label: 'Reply', body: finalText })
      } else if (block.type === 'tool_use') {
        const label = block.name === 'list_folder' ? `Listing your ${block.input.folder} folder`
          : block.name === 'read_file' ? `Reading ${block.input.file}`
          : block.name === 'web_search' ? `Searching the web for "${block.input.query}"`
          : block.name === 'web_fetch' ? `Fetching ${block.input.url}`
          : `Using ${block.name}`
        send({ type: 'tool', agentId: role, level: 'subagent', text: `${label}.` })
        transcript.push({ kind: 'tool', label: block.name, body: JSON.stringify(block.input) })
        let result
        try {
          result = (mcp && mcp.has(block.name))
            ? await mcp.call(block.name, block.input)
            : await execTool(block.name, block.input, folders, signal)
        } catch (e) { if (isAbort(e, signal)) { flush(); return '(stopped)' } result = `Error: ${errMessage(e)}` }
        transcript.push({ kind: 'result', label: `${block.name} result`, body: String(result).slice(0, 2000) })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: String(result).slice(0, MAX_TOOL_RESULT_CHARS) })
      }
    }
    messages.push({ role: 'assistant', content: resp.content })
    if (resp.stop_reason !== 'tool_use' || !toolResults.length) break
    messages.push({ role: 'user', content: toolResults })
  }
  flush()
  return finalText || '(no result)'
}

function buildOrchestratorTools(specialistIds) {
  const ids = specialistIds.length ? specialistIds : ['researcher', 'writer', 'reviewer']
  return [
    {
      name: 'delegate',
      description: 'Delegate a subtask to a specialist. Call it multiple times in one turn to run specialists in parallel.',
      input_schema: {
        type: 'object',
        properties: {
          specialist: { type: 'string', enum: ids, description: 'Which specialist handles the subtask.' },
          task: { type: 'string', description: 'A clear, self-contained instruction for the specialist.' },
        },
        required: ['specialist', 'task'],
      },
    },
    {
      name: 'submit_deliverable',
      description: 'Submit the finished deliverable once specialists have done the work. Call exactly once.',
      input_schema: {
        type: 'object',
        properties: { filename: { type: 'string' }, content: { type: 'string' } },
        required: ['filename', 'content'],
      },
    },
  ]
}

// --- IPC ---------------------------------------------------------------------

function registerAgentIpc() {
  ipcMain.handle('config:status', () => {
    const providers = readConfig().providers || {}
    const roleModels = getRoleModels()
    return {
      ready: providerConfigured(roleModels.orchestrator.provider),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      providers: {
        anthropic: { configured: !!decodeSecret(providers.anthropic) },
        openai: { configured: !!decodeSecret(providers.openai) },
        gemini: { configured: !!decodeSecret(providers.gemini) },
        local: { baseUrl: (providers.local && providers.local.baseUrl) || '' },
      },
      roleModels,
      mcpServers: mcpServersSanitised(),
    }
  })

  ipcMain.handle('config:setMcpServer', async (event, { id, name, url, token, transport, command, args }) => {
    const cleanName = String(name || '').trim()
    const t = transport === 'stdio' ? 'stdio' : 'url'
    if (!cleanName) return { ok: false, error: 'A name is required.' }
    if (t === 'url' && !String(url || '').trim()) return { ok: false, error: 'A server URL is required.' }
    if (t === 'stdio' && !String(command || '').trim()) return { ok: false, error: 'A command is required.' }
    const cfg = readConfig()
    const servers = Array.isArray(cfg.mcpServers) ? cfg.mcpServers.slice() : []
    const existing = servers.find(s => s.id === id)
    const entry = { id: id || `mcp-${Date.now()}`, name: cleanName, transport: t }
    if (t === 'url') {
      entry.url = String(url).trim()
      let scheme
      try { scheme = new URL(entry.url).protocol } catch { return { ok: false, error: 'That server URL is not valid.' } }
      if (scheme !== 'http:' && scheme !== 'https:') return { ok: false, error: 'The server URL must start with http or https.' }
    } else { entry.command = String(command).trim(); entry.args = Array.isArray(args) ? args : String(args || '').split(/\s+/).filter(Boolean) }

    // A stdio server runs a local executable. Confirm with the user before
    // persisting a new or changed command, so this cannot be configured silently.
    if (t === 'stdio') {
      const changed = !existing || existing.command !== entry.command || JSON.stringify(existing.args || []) !== JSON.stringify(entry.args)
      if (changed) {
        const win = BrowserWindow.fromWebContents(event.sender)
        const opts = {
          type: 'warning',
          buttons: ['Cancel', 'Run this command'],
          defaultId: 0,
          cancelId: 0,
          title: 'Confirm local MCP server',
          message: `"${cleanName}" will run a program on this machine whenever your team works.`,
          detail: `Command:\n${[entry.command, ...entry.args].join(' ')}\n\nOnly continue if you trust this command.`,
        }
        const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
        if (response !== 1) return { ok: false, error: 'Cancelled.' }
      }
    }
    const tok = String(token || '').trim()
    if (tok) {
      try { entry.token = encodeSecret(tok) }
      catch (err) { return { ok: false, error: errMessage(err) } }
    }
    else if (existing && existing.token) entry.token = existing.token
    if (existing && existing.oauth) entry.oauth = existing.oauth
    const idx = servers.findIndex(s => s.id === entry.id)
    if (idx >= 0) servers[idx] = entry
    else servers.push(entry)
    cfg.mcpServers = servers
    writeConfig(cfg)
    return { ok: true, id: entry.id }
  })

  ipcMain.handle('config:removeMcpServer', (_e, { id }) => {
    const cfg = readConfig()
    cfg.mcpServers = getMcpServers().filter(s => s.id !== id)
    writeConfig(cfg)
    return { ok: true }
  })

  ipcMain.handle('mcp:authorize', async (_e, { id }) => {
    const s = getMcpServers().find(x => x.id === id)
    if (!s) return { ok: false, error: 'Server not found.' }
    try {
      const r = await authorizeServer(s.url)
      persistMcpServer({
        ...s,
        oauth: {
          clientId: r.clientId,
          tokenEndpoint: r.tokenEndpoint,
          accessToken: encodeSecret(r.accessToken),
          refreshToken: r.refreshToken ? encodeSecret(r.refreshToken) : null,
          expiresAt: r.expiresAt,
        },
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: errMessage(err) }
    }
  })

  ipcMain.handle('mcp:test', async (_e, { id }) => {
    const s = getMcpServers().find(x => x.id === id)
    if (!s) return { ok: false, error: 'Server not found.' }
    const token = s.token ? decodeSecret(s.token) : null
    try {
      const res = await fetch(s.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'YourAIStaff', version: '1.0' } } }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const text = await res.text()
      const m = text.match(/"serverInfo"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/)
      return { ok: true, name: m ? m[1] : '' }
    } catch (err) {
      return { ok: false, error: errMessage(err) }
    }
  })

  ipcMain.handle('config:setProviderKey', (_e, { provider, apiKey }) => {
    if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'gemini') return { ok: false, error: 'Unknown provider.' }
    const cfg = readConfig()
    cfg.providers = cfg.providers || {}
    const key = String(apiKey || '').trim()
    if (!key) delete cfg.providers[provider]
    else {
      try { cfg.providers[provider] = encodeSecret(key) }
      catch (err) { return { ok: false, error: errMessage(err) } }
    }
    writeConfig(cfg)
    return { ok: true }
  })

  ipcMain.handle('config:setLocalBaseUrl', (_e, { baseUrl }) => {
    const cfg = readConfig()
    cfg.providers = cfg.providers || {}
    cfg.providers.local = { baseUrl: String(baseUrl || '').trim() }
    writeConfig(cfg)
    return { ok: true }
  })

  ipcMain.handle('config:setRoleModel', (_e, { role, provider, model }) => {
    if (!role) return { ok: false, error: 'Missing role.' }
    const cfg = readConfig()
    cfg.roleModels = { ...(cfg.roleModels || {}) }
    cfg.roleModels[role] = { provider, model: String(model || '').trim() }
    writeConfig(cfg)
    return { ok: true }
  })

  ipcMain.handle('models:list', async (_e, { provider }) => {
    try {
      return { ok: true, models: await listModels({ provider, creds: credsFor(provider) }) }
    } catch (err) {
      return { ok: false, error: errMessage(err) }
    }
  })

  ipcMain.handle('agent:runOrchestrator', async (event, { brief, folders, team }) => {
    const orchestrator = roleModelFor('orchestrator')
    if (!providerConfigured(orchestrator.provider)) {
      return { ok: false, error: 'The orchestrator\'s provider has no credentials configured.' }
    }
    const connected = connectedOnly(folders)
    const send = e => event.sender.send('agent:event', e)
    const roster = (team || []).filter(a => a && a.id && a.id !== 'orchestrator')
    const specialists = Object.fromEntries(roster.map(a => [a.id, a]))
    const specialistIds = roster.length ? roster.map(a => a.id) : ['researcher', 'writer', 'reviewer']
    const tools = buildOrchestratorTools(specialistIds)
    const folderList = connected.map(f => `${f.name} (${f.permission})`).join(', ') || 'none connected'
    const rosterList = roster.length
      ? roster.map(a => `${a.id} (${a.role || a.name})`).join(', ')
      : 'researcher (gathers information), writer (drafts), reviewer (gives feedback)'

    const system = [
      'You are the orchestrator of a small AI team. The user gives a brief; you coordinate specialists to produce a deliverable.',
      'You do not read files or write the deliverable yourself. You delegate.',
      `Specialists available: ${rosterList}.`,
      `Connected folders the specialists may read: ${folderList}.`,
      'Use the delegate tool to assign subtasks. When several subtasks are independent, emit multiple delegate calls in the SAME turn so they run in parallel.',
      'Narrate your routing decisions in one short first-person sentence each.',
      'When the deliverable is ready, call submit_deliverable exactly once with a Markdown filename and the full content.',
      'British English. No em dashes.',
    ].join('\n')

    const creds = credsFor(orchestrator.provider)
    const mcp = await createMcpSession(await resolveMcpConfigs(), msg => send({ type: 'text', agentId: 'orchestrator', level: 'orchestrator', text: msg }))
    const controller = new AbortController()
    activeController = controller
    const signal = controller.signal
    const usage = newUsage()
    const messages = [{ role: 'user', content: brief }]
    let draft = null
    let lastText = ''

    try {
      for (let turn = 0; turn < ORCHESTRATOR_MAX_TURNS && !draft; turn++) {
        if (signal.aborted) break
        let resp
        try {
          resp = await runModel({ roleModel: orchestrator, creds, system, messages, tools, signal })
        } catch (err) {
          if (isAbort(err, signal)) return { ok: false, aborted: true }
          send({ type: 'error', agentId: 'orchestrator', level: 'orchestrator', text: `Model error: ${errMessage(err)}` })
          return { ok: false, error: errMessage(err) }
        }
        addUsage(usage, resp.usage, orchestrator)

        const delegations = []
        const toolResults = []
        for (const block of resp.content) {
          if (block.type === 'text' && block.text.trim()) {
            lastText = block.text.trim()
            send({ type: 'text', agentId: 'orchestrator', level: 'orchestrator', text: lastText })
          } else if (block.type === 'tool_use') {
            if (block.name === 'submit_deliverable') {
              draft = { filename: String(block.input.filename || 'deliverable.md'), content: String(block.input.content || '') }
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Deliverable received.' })
            } else if (block.name === 'delegate') {
              delegations.push({ id: block.id, specialist: block.input.specialist, task: String(block.input.task || '') })
            }
          }
        }
        messages.push({ role: 'assistant', content: resp.content })
        if (draft) break

        if (delegations.length) {
          const results = await Promise.all(delegations.map((d, i) =>
            runSubAgent({ role: d.specialist, task: d.task, folders: connected, send, signal, specialists, usage, subId: `t${turn}_${i}_${d.specialist}`, mcp })
              .then(text => ({ id: d.id, text }))
              .catch(err => ({ id: d.id, text: `Error: ${errMessage(err)}` }))
          ))
          for (const r of results) toolResults.push({ type: 'tool_result', tool_use_id: r.id, content: String(r.text).slice(0, MAX_TOOL_RESULT_CHARS) })
        }

        if (signal.aborted) break
        if (toolResults.length) messages.push({ role: 'user', content: toolResults })
        else if (resp.stop_reason !== 'tool_use') messages.push({ role: 'user', content: 'Please finish by calling submit_deliverable with the deliverable.' })
      }

      if (signal.aborted) return { ok: false, aborted: true }
      if (!draft && lastText) draft = { filename: 'deliverable.md', content: lastText }
      if (!draft) return { ok: false, error: 'The run finished without a deliverable.' }
      return { ok: true, draft, usage }
    } finally {
      try { await mcp.close() } catch { /* ignore */ }
      if (activeController === controller) activeController = null
    }
  })

  // Review/revise loop (reviewer + writer models) then real write.
  ipcMain.handle('agent:reviewAndWrite', async (event, { brief, draft, folders }) => {
    const reviewer = roleModelFor('reviewer')
    const writer = roleModelFor('writer')
    if (!providerConfigured(reviewer.provider)) return { ok: false, error: 'The reviewer\'s provider has no credentials configured.' }
    const connected = connectedOnly(folders)
    const writeFolder = connected.find(f => f.permission === 'read-write')
    const send = e => event.sender.send('agent:event', e)
    const controller = new AbortController()
    activeController = controller
    const signal = controller.signal
    const usage = newUsage()

    try {
      let content = String((draft && draft.content) || '')
      let approved = false
      for (let round = 0; round < REVIEW_ROUNDS && !approved; round++) {
        if (signal.aborted) return { ok: false, aborted: true }
        send({ type: 'tool', agentId: 'reviewer', level: 'subagent', text: round === 0 ? 'Reviewing the deliverable.' : 'Re-checking the revision.' })
        let verdict
        try {
          verdict = await runModel({
            roleModel: reviewer, creds: credsFor(reviewer.provider),
            system: 'You are a reviewer. Assess the draft against the brief for accuracy, tone and completeness. If it fully meets the brief, reply with exactly "APPROVED" and nothing else. Otherwise reply with a short bullet list of the specific changes required. British English, no em dashes.',
            messages: [{ role: 'user', content: `Brief: ${brief}\n\nDraft:\n\n${content}` }], tools: [], signal,
          })
        } catch (err) {
          if (isAbort(err, signal)) return { ok: false, aborted: true }
          send({ type: 'text', agentId: 'reviewer', level: 'subagent', text: 'Could not complete the review; using the current draft.' })
          break
        }
        addUsage(usage, verdict.usage, reviewer)
        const vtext = textOf(verdict.content)
        if (/^approved/i.test(vtext)) { approved = true; send({ type: 'text', agentId: 'reviewer', level: 'subagent', text: 'Looks good. Approving the deliverable.' }); break }
        send({ type: 'text', agentId: 'reviewer', level: 'subagent', text: vtext || 'Requesting revisions.' })

        if (signal.aborted) return { ok: false, aborted: true }
        send({ type: 'tool', agentId: 'writer', level: 'subagent', text: 'Revising to address the feedback.' })
        let rev
        try {
          rev = await runModel({
            roleModel: writer, creds: credsFor(writer.provider),
            system: 'You are a writer. Revise the draft to address the reviewer feedback. Reply with ONLY the full revised Markdown document, no preamble. British English, no em dashes.',
            messages: [{ role: 'user', content: `Brief: ${brief}\n\nCurrent draft:\n\n${content}\n\nReviewer feedback:\n\n${vtext}` }], tools: [], signal,
          })
        } catch (err) {
          if (isAbort(err, signal)) return { ok: false, aborted: true }
          send({ type: 'text', agentId: 'writer', level: 'subagent', text: 'Could not revise; keeping the current draft.' })
          break
        }
        addUsage(usage, rev.usage, writer)
        const rtext = textOf(rev.content)
        if (rtext) content = rtext
      }
      send({ type: 'text', agentId: 'reviewer', level: 'subagent', text: 'Review complete. The deliverable is ready.' })

      if (signal.aborted) return { ok: false, aborted: true }
      if (!writeFolder) return { ok: true, written: null, finalContent: content, usage }

      if (!isWithinGrant(writeFolder.path)) return { ok: false, error: 'The write folder is not authorised. Reconnect it from Folders.' }
      const safe = path.basename(String((draft && draft.filename) || 'deliverable.md')) || 'deliverable.md'
      const root = path.resolve(writeFolder.path)
      const target = path.resolve(root, safe)
      if (target !== root && !target.startsWith(root + path.sep)) return { ok: false, error: 'Refusing to write outside the connected folder.' }
      if (signal.aborted) return { ok: false, aborted: true }
      try {
        await fs.promises.writeFile(target, content, 'utf8')
      } catch (err) {
        return { ok: false, error: errMessage(err) }
      }
      return { ok: true, written: { path: target, name: safe, folder: writeFolder.name }, usage, finalContent: content }
    } finally {
      if (activeController === controller) activeController = null
    }
  })

  ipcMain.handle('agent:stop', () => {
    if (activeController) activeController.abort()
    return { ok: true }
  })
}

module.exports = { registerAgentIpc }
