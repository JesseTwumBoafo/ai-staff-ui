// Cross-provider MCP client. Connects to configured MCP servers (local stdio or
// remote HTTP/SSE), lists their tools, and exposes them as ordinary tool
// definitions the agent loop can hand to any provider. Tool calls are executed
// here and the result returned to the model.
//
// The SDK is ESM-only, so it is loaded via dynamic import from this CJS module.

let sdkPromise = null
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'),
      import('@modelcontextprotocol/sdk/client/stdio.js'),
      import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
      import('@modelcontextprotocol/sdk/client/sse.js'),
    ]).then(([idx, stdio, http, sse]) => ({
      Client: idx.Client,
      StdioClientTransport: stdio.StdioClientTransport,
      getDefaultEnvironment: stdio.getDefaultEnvironment,
      StreamableHTTPClientTransport: http.StreamableHTTPClientTransport,
      SSEClientTransport: sse.SSEClientTransport,
    }))
  }
  return sdkPromise
}

function sanitizeKey(name) {
  return String(name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().replace(/_+/g, '_').replace(/^_|_$/g, '') || 'mcp'
}

function transportCandidates(sdk, s) {
  if (s.transport === 'stdio') {
    // Do NOT inherit the full process environment: that would hand every env var
    // (including any API keys) to a third-party binary. Use the SDK's minimal
    // safe default env (PATH, HOME and platform basics) plus only the variables
    // the server config explicitly declares.
    const base = typeof sdk.getDefaultEnvironment === 'function' ? sdk.getDefaultEnvironment() : {}
    const env = { ...base, ...(s.env || {}) }
    return [() => new sdk.StdioClientTransport({ command: s.command, args: s.args || [], env })]
  }
  const url = new URL(s.url)
  const requestInit = s.token ? { headers: { Authorization: `Bearer ${s.token}` } } : undefined
  const http = () => new sdk.StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined)
  const sse = () => new sdk.SSEClientTransport(url, requestInit ? { requestInit } : undefined)
  return /\/sse\/?$/.test(s.url) ? [sse, http] : [http, sse]
}

// servers: [{ id, name, transport:'url'|'stdio', url?, command?, args?, env?, token? }]
// onLog: optional (message) => void for surfacing connection issues
async function createMcpSession(servers, onLog) {
  if (!servers || !servers.length) {
    return { tools: [], has: () => false, call: async () => 'No MCP tool.', close: async () => {} }
  }
  const sdk = await loadSdk()
  const clients = []
  const router = new Map() // namespaced name -> { client, originalName }
  const toolDefs = []

  for (const s of servers) {
    let connected = false
    const client = new sdk.Client({ name: 'YourAIStaff', version: '1.0.0' }, { capabilities: {} })
    try {
      for (const make of transportCandidates(sdk, s)) {
        try { await client.connect(make()); connected = true; break } catch { /* try next transport */ }
      }
      if (!connected) { if (onLog) onLog(`Could not connect to MCP server "${s.name}".`); continue }
      clients.push(client)
      const listed = await client.listTools()
      const prefix = sanitizeKey(s.name)
      for (const t of (listed.tools || [])) {
        const ns = `${prefix}__${t.name}`.slice(0, 64)
        router.set(ns, { client, originalName: t.name })
        toolDefs.push({
          name: ns,
          description: `[${s.name}] ${t.description || t.name}`.slice(0, 1000),
          input_schema: t.inputSchema || { type: 'object', properties: {} },
        })
      }
    } catch (err) {
      if (onLog) onLog(`MCP server "${s.name}": ${String((err && err.message) || err)}`)
    }
  }

  return {
    tools: toolDefs,
    has: name => router.has(name),
    call: async (name, input) => {
      const entry = router.get(name)
      if (!entry) return 'Unknown MCP tool.'
      try {
        const res = await entry.client.callTool({ name: entry.originalName, arguments: input || {} })
        const content = res.content || []
        const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n')
        return text || JSON.stringify(content)
      } catch (err) {
        return `MCP tool error: ${String((err && err.message) || err)}`
      }
    },
    close: async () => { for (const c of clients) { try { await c.close() } catch { /* ignore */ } } },
  }
}

module.exports = { createMcpSession }
