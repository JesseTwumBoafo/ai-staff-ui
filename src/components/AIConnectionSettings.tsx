import { useState, useEffect } from 'react'
import { Check, KeyRound } from 'lucide-react'
import type { ConfigStatus } from '../electron'
import { PROVIDER_LABELS } from '../data/models'

interface AIConnectionSettingsProps {
  onToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
}

const electronAPI = window.electronAPI

const inputStyle: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit',
}
const fieldStyle: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 32,
  border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '0 10px',
  background: 'var(--surface-content)',
}

type KeyProvider = 'anthropic' | 'openai' | 'gemini'

export function AIConnectionSettings({ onToast }: AIConnectionSettingsProps) {
  const [status, setStatus] = useState<ConfigStatus | null>(null)
  const [anthroKey, setAnthroKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [localUrl, setLocalUrl] = useState('')

  async function refresh() {
    if (!electronAPI) return
    try {
      const s = await electronAPI.configStatus()
      setStatus(s)
      setLocalUrl(s.providers.local.baseUrl || '')
    } catch { /* ignore */ }
  }

  useEffect(() => { refresh() }, [])

  if (!electronAPI) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        Connecting a model is only available in the desktop app.
      </p>
    )
  }

  async function saveKey(provider: KeyProvider, value: string, clear: () => void) {
    const res = await electronAPI!.setProviderKey(provider, value.trim())
    if (res.ok) {
      clear()
      onToast(`${PROVIDER_LABELS[provider]} key saved`, 'success')
      refresh()
    } else {
      onToast(res.error ?? 'Could not save the key', 'error')
    }
  }

  async function saveLocalUrl() {
    await electronAPI!.setLocalBaseUrl(localUrl.trim())
    onToast('Local endpoint saved', 'success')
    refresh()
  }

  const providerConnected = (p: KeyProvider) => !!status?.providers[p].configured

  // Inlined elements (not a nested component) so the password inputs keep focus.
  function keyRow(provider: KeyProvider, value: string, onChange: (v: string) => void, placeholder: string) {
    const connected = providerConnected(provider)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 78, fontSize: 12, color: 'var(--text-secondary)' }}>{PROVIDER_LABELS[provider]}</div>
        <div style={fieldStyle}>
          <KeyRound size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="password"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && value.trim()) saveKey(provider, value, () => onChange('')) }}
            placeholder={connected ? 'Connected. Enter a new key to replace.' : placeholder}
            style={inputStyle}
          />
          {connected && <Check size={13} style={{ color: 'var(--semantic-success)', flexShrink: 0 }} />}
        </div>
        <button className="btn-secondary" style={{ height: 32 }} disabled={!value.trim()} onClick={() => saveKey(provider, value, () => onChange(''))}>
          {connected ? 'Replace' : 'Save'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Connect one or more providers here, then assign a model to each team member from their profile. Keys are stored
        {' '}{status?.encryptionAvailable ? 'encrypted in your OS keychain' : 'on this machine'} and never leave the desktop app.
        Without a configured orchestrator, briefs run in scripted demo mode.
      </p>

      {keyRow('anthropic', anthroKey, setAnthroKey, 'sk-ant-...')}
      {keyRow('openai', openaiKey, setOpenaiKey, 'sk-...')}
      {keyRow('gemini', geminiKey, setGeminiKey, 'AIza...')}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 78, fontSize: 12, color: 'var(--text-secondary)' }}>Local</div>
        <div style={fieldStyle}>
          <input
            value={localUrl}
            onChange={e => setLocalUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveLocalUrl() }}
            placeholder="http://localhost:11434/v1 (Ollama, LM Studio, ...)"
            style={inputStyle}
          />
        </div>
        <button className="btn-secondary" style={{ height: 32 }} onClick={saveLocalUrl}>Save</button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
        Local and Gemini use OpenAI-compatible endpoints. Set each team member's model from their profile.
      </p>
    </div>
  )
}
