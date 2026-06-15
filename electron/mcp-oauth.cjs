// MCP OAuth 2.0 client (desktop / native app profile).
//
// Flow: discover the server's authorization server, dynamically register a
// public client, run Authorization Code + PKCE through the system browser with
// a loopback (127.0.0.1) redirect, exchange the code for tokens, and refresh
// them when they expire. Spec-aligned (RFC 8252 loopback, RFC 7636 PKCE,
// RFC 7591 dynamic registration, RFC 8707 resource indicators).

const http = require('http')
const crypto = require('crypto')
const { shell } = require('electron')

const FETCH_TIMEOUT = 8000
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Discover authorization-server endpoints for an MCP server URL.
async function discoverAuth(serverUrl) {
  const origin = new URL(serverUrl).origin

  let resourceMeta = null
  for (const u of [
    new URL('/.well-known/oauth-protected-resource', serverUrl).toString(),
    `${origin}/.well-known/oauth-protected-resource`,
  ]) {
    try { resourceMeta = await getJson(u); break } catch { /* try next */ }
  }

  const authServerUrl = (resourceMeta && Array.isArray(resourceMeta.authorization_servers) && resourceMeta.authorization_servers[0]) || origin
  const base = authServerUrl.replace(/\/$/, '')

  let asm = null
  for (const u of [`${base}/.well-known/oauth-authorization-server`, `${base}/.well-known/openid-configuration`]) {
    try { asm = await getJson(u); break } catch { /* try next */ }
  }
  if (!asm || !asm.authorization_endpoint || !asm.token_endpoint) {
    throw new Error('Could not discover OAuth endpoints for this server.')
  }
  return {
    authorizationEndpoint: asm.authorization_endpoint,
    tokenEndpoint: asm.token_endpoint,
    registrationEndpoint: asm.registration_endpoint || null,
    scopesSupported: asm.scopes_supported || [],
    resource: serverUrl,
  }
}

async function registerClient(meta, redirectUri) {
  if (!meta.registrationEndpoint) throw new Error('This server does not support dynamic client registration.')
  const res = await fetch(meta.registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Your AI Staff',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) throw new Error(`Client registration failed (HTTP ${res.status}).`)
  const data = await res.json()
  if (!data.client_id) throw new Error('Registration returned no client_id.')
  return data.client_id
}

// Start a loopback HTTP server; resolve with { port, server, waitForCode }.
function startLoopback() {
  return new Promise((resolve, reject) => {
    let onCode = null
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1')
      if (!u.pathname.startsWith('/callback')) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:system-ui,sans-serif;padding:48px;text-align:center"><h2>You can close this window.</h2><p>Authorisation complete. Return to Your AI Staff.</p></body></html>')
      if (onCode) onCode(u.searchParams)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const waitForCode = (state) => new Promise((res2, rej2) => {
        const timer = setTimeout(() => rej2(new Error('Authorisation timed out.')), AUTH_TIMEOUT_MS)
        onCode = (params) => {
          clearTimeout(timer)
          if (params.get('error')) return rej2(new Error(params.get('error_description') || params.get('error')))
          if (params.get('state') !== state) return rej2(new Error('State mismatch.'))
          const code = params.get('code')
          if (!code) return rej2(new Error('No authorisation code returned.'))
          res2(code)
        }
      })
      resolve({ port, server, waitForCode })
    })
  })
}

async function exchangeToken(meta, clientId, params) {
  const res = await fetch(meta.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...params }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Token request failed (HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}).`)
  return res.json()
}

// Run the full authorisation flow for a server URL. Returns tokens + the bits
// needed to refresh later.
async function authorizeServer(serverUrl) {
  const meta = await discoverAuth(serverUrl)
  const { port, server, waitForCode } = await startLoopback()
  try {
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const clientId = await registerClient(meta, redirectUri)
    const { verifier, challenge } = pkce()
    const state = crypto.randomBytes(16).toString('hex')

    const authUrl = new URL(meta.authorizationEndpoint)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('resource', meta.resource)
    if (meta.scopesSupported.length) authUrl.searchParams.set('scope', meta.scopesSupported.join(' '))

    await shell.openExternal(authUrl.toString())
    const code = await waitForCode(state)
    const tokens = await exchangeToken(meta, clientId, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })
    return {
      clientId,
      tokenEndpoint: meta.tokenEndpoint,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    }
  } finally {
    try { server.close() } catch { /* ignore */ }
  }
}

// Refresh an access token. Returns the new token bundle.
async function refreshAccess({ tokenEndpoint, clientId, refreshToken }) {
  const tokens = await exchangeToken({ tokenEndpoint }, clientId, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
  }
}

module.exports = { authorizeServer, refreshAccess }
