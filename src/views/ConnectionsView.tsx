import { useState, useEffect } from 'react'
import { Plug, Trash2, Check, AlertCircle, Loader } from 'lucide-react'
import type { ConfigStatus, McpServerInfo } from '../electron'

interface ConnectionsViewProps {
  onToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

const electronAPI = window.electronAPI

const fieldStyle: React.CSSProperties = {
  flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--border-subtle)',
  borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface-content)',
  fontFamily: 'inherit', outline: 'none',
}

type Transport = 'url' | 'stdio'
interface Preset { label: string; transport: Transport; url?: string; command?: string; args?: string; hint: string }

// Pre-filled (editable) starting points. URLs/commands are for review; verify
// against the provider's docs if anything has changed.
const PRESETS: Preset[] = [
  { label: 'GitHub', transport: 'url', url: 'https://api.githubcopilot.com/mcp/', hint: 'Press Connect to sign in with GitHub, or paste a fine-grained PAT as the token.' },
  { label: 'Notion', transport: 'url', url: 'https://mcp.notion.com/mcp', hint: 'Press Connect to sign in with Notion (OAuth).' },
  { label: 'Linear', transport: 'url', url: 'https://mcp.linear.app/sse', hint: 'Press Connect to sign in with Linear (OAuth).' },
  { label: 'Atlassian', transport: 'url', url: 'https://mcp.atlassian.com/v1/sse', hint: 'Press Connect to sign in with Atlassian (Jira and Confluence, OAuth).' },
  { label: 'Stripe', transport: 'url', url: 'https://mcp.stripe.com', hint: 'Press Connect to sign in, or paste a Stripe restricted key as the token.' },
  { label: 'Sentry', transport: 'url', url: 'https://mcp.sentry.dev/mcp', hint: 'Press Connect to sign in with Sentry.' },
  { label: 'Zapier', transport: 'url', url: '', hint: 'Generate your personal MCP server URL at zapier.com/mcp and paste it into the URL field.' },
  { label: 'Salesforce', transport: 'url', url: '', hint: 'Paste your Salesforce MCP server URL, then press Connect.' },
  { label: 'Supabase', transport: 'stdio', command: 'npx', args: '-y @supabase/mcp-server-supabase@latest --access-token=YOUR_TOKEN', hint: 'Runs locally. Replace YOUR_TOKEN with a Supabase access token.' },
  { label: 'Slack', transport: 'stdio', command: 'npx', args: '-y @modelcontextprotocol/server-slack', hint: 'Runs locally. Needs SLACK_BOT_TOKEN and SLACK_TEAM_ID in your environment.' },
]

export function ConnectionsView({ onToast }: ConnectionsViewProps) {
  const [status, setStatus] = useState<ConfigStatus | null>(null)
  const [transport, setTransport] = useState<Transport>('url')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [token, setToken] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [authorizing, setAuthorizing] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({})

  async function refresh() {
    if (!electronAPI) return
    try { setStatus(await electronAPI.configStatus()) } catch { /* ignore */ }
  }
  useEffect(() => { refresh() }, [])

  if (!electronAPI) {
    return <div style={{ padding: 24 }}><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Connections are only available in the desktop app.</p></div>
  }

  const servers: McpServerInfo[] = status?.mcpServers ?? []

  function reset() { setName(''); setUrl(''); setCommand(''); setArgs(''); setToken(''); setHint(null) }

  async function add() {
    if (!name.trim()) return
    setSaving(true)
    const res = await electronAPI!.setMcpServer({ name: name.trim(), transport, url: url.trim(), command: command.trim(), args: args.trim(), token: token.trim() })
    setSaving(false)
    if (res.ok) { reset(); onToast('Connection added', 'success'); refresh() }
    else onToast(res.error ?? 'Could not add the connection', 'error')
  }

  async function remove(id: string) { await electronAPI!.removeMcpServer(id); onToast('Connection removed', 'info'); refresh() }

  async function test(id: string) {
    setTesting(id)
    const res = await electronAPI!.testMcpServer(id)
    setTesting(null)
    setTestResult(prev => ({ ...prev, [id]: { ok: res.ok, text: res.ok ? (res.name ? `Reachable (${res.name})` : 'Reachable') : (res.error ?? 'Unreachable') } }))
  }

  async function connect(id: string) {
    setAuthorizing(id)
    const res = await electronAPI!.authorizeMcpServer(id)
    setAuthorizing(null)
    if (res.ok) { onToast('Signed in', 'success'); refresh() }
    else onToast(res.error ?? 'Sign-in failed', 'error')
  }

  function applyPreset(p: Preset) {
    setTransport(p.transport); setName(p.label)
    setUrl(p.url ?? ''); setCommand(p.command ?? ''); setArgs(p.args ?? ''); setToken('')
    setHint(p.hint)
  }

  function authChip(s: McpServerInfo) {
    if (s.transport === 'stdio') return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-sidebar)', borderRadius: 4, padding: '1px 6px' }}>Local</span>
    if (s.authState === 'oauth') return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--semantic-success)', background: '#e8f7ef', borderRadius: 4, padding: '1px 6px' }}>Signed in</span>
    if (s.authState === 'token') return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-sidebar)', borderRadius: 4, padding: '1px 6px' }}>Token</span>
    return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--semantic-warning)', background: '#fff7e6', borderRadius: 4, padding: '1px 6px' }}>Not connected</span>
  }

  const toggleBtn = (t: Transport, label: string) => (
    <button
      onClick={() => setTransport(t)}
      style={{
        flex: 1, height: 30, borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
        border: '1px solid', borderColor: transport === t ? 'var(--accent-primary)' : 'var(--border-strong)',
        background: transport === t ? 'var(--state-active)' : 'transparent',
        color: transport === t ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: transport === t ? 600 : 400,
      }}
    >{label}</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', borderBottom: '1px solid var(--border-strong)', background: 'var(--surface-header)' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Connections</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{servers.length} MCP server{servers.length === 1 ? '' : 's'}</span>
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>
            Connect MCP (Model Context Protocol) servers to give your team extra tools. They work across all providers (Anthropic, OpenAI, Gemini, local). Add a <strong>remote</strong> server by URL and sign in with OAuth, or run a <strong>local</strong> server by command on this machine.
          </p>

          {/* Existing servers */}
          {servers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0 20px' }}>
              {servers.map(s => {
                const r = testResult[s.id]
                return (
                  <div key={s.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--state-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Plug size={14} style={{ color: 'var(--accent-primary)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                          {authChip(s)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.transport === 'stdio' ? `${s.command} ${s.args}`.trim() : s.url}
                        </div>
                      </div>
                      {s.transport === 'url' && (
                        <>
                          <button className="btn-secondary" style={{ height: 28 }} disabled={authorizing === s.id} onClick={() => connect(s.id)}>
                            {authorizing === s.id ? <Loader size={11} /> : (s.authState === 'oauth' ? 'Reconnect' : 'Connect')}
                          </button>
                          <button className="btn-secondary" style={{ height: 28 }} disabled={testing === s.id} onClick={() => test(s.id)}>
                            {testing === s.id ? <Loader size={11} /> : 'Test'}
                          </button>
                        </>
                      )}
                      <button onClick={() => remove(s.id)} title="Remove" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {r && (
                      <div style={{ marginTop: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: r.ok ? 'var(--semantic-success)' : 'var(--semantic-error)' }}>
                        {r.ok ? <Check size={11} /> : <AlertCircle size={11} />} {r.text}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add a server */}
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Add a server</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick add:</span>
            {PRESETS.map(p => (
              <button key={p.label} className="btn-secondary" style={{ height: 26 }} onClick={() => applyPreset(p)}>{p.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>{toggleBtn('url', 'Remote (URL)')}{toggleBtn('stdio', 'Local (command)')}</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (e.g. GitHub)" style={fieldStyle} />
            {transport === 'url' ? (
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Server URL (https://...)" style={fieldStyle} />
            ) : (
              <>
                <input value={command} onChange={e => setCommand(e.target.value)} placeholder="Command (e.g. npx)" style={fieldStyle} />
                <input value={args} onChange={e => setArgs(e.target.value)} placeholder="Arguments (e.g. -y @supabase/mcp-server-supabase)" style={fieldStyle} />
              </>
            )}
            {transport === 'url' && (
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Auth token (optional)" style={fieldStyle} />
            )}
            {hint && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{hint}</p>}
            <div>
              <button className="btn-primary" disabled={!name.trim() || saving || (transport === 'url' ? !url.trim() : !command.trim())} onClick={add}>
                {saving ? 'Adding...' : 'Add connection'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
