import { useState, useEffect } from 'react'
import type { ConfigStatus, ProviderName, RoleModel } from '../electron'
import { PROVIDER_LABELS, PROVIDER_ORDER, MODEL_OPTIONS } from '../data/models'

const electronAPI = window.electronAPI
const CUSTOM = '__custom__'
const FALLBACK: RoleModel = { provider: 'anthropic', model: 'claude-haiku-4-5' }

const controlStyle: React.CSSProperties = {
  height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)',
  background: 'var(--surface-content)', color: 'var(--text-primary)',
  fontSize: 13, fontFamily: 'inherit', padding: '0 8px',
}

// Dependent picklists for assigning a provider + model to one team role.
// Fetches the provider's live model list where available, falling back to a
// curated list, with a Custom... escape hatch. Self-contained via the bridge.
export function RoleModelPicker({ role }: { role: string }) {
  const [status, setStatus] = useState<ConfigStatus | null>(null)
  const [value, setValue] = useState<RoleModel | null>(null)
  const [liveModels, setLiveModels] = useState<Partial<Record<ProviderName, string[]>>>({})

  async function refresh() {
    if (!electronAPI) return
    try {
      const s = await electronAPI.configStatus()
      setStatus(s)
      setValue(s.roleModels[role] ?? FALLBACK)
    } catch { /* ignore */ }
  }

  useEffect(() => { refresh() }, [role])

  // Fetch live model ids for the selected provider (once per provider).
  useEffect(() => {
    const p = value?.provider
    if (!p || !electronAPI || liveModels[p]) return
    electronAPI.listModels(p)
      .then(r => { if (r.ok && r.models && r.models.length) setLiveModels(prev => ({ ...prev, [p]: r.models })) })
      .catch(() => {})
  }, [value?.provider])

  if (!electronAPI || !status || !value) return null

  function save(next: RoleModel) {
    setValue(next)
    electronAPI!.setRoleModel(role, next.provider, next.model)
  }

  function onProvider(provider: ProviderName) {
    const live = liveModels[provider]
    const opts = (live && live.length) ? live : MODEL_OPTIONS[provider]
    save({ provider, model: opts[0] || '' })
  }

  function configuredFor(p: ProviderName): boolean {
    if (p === 'local') return !!status!.providers.local.baseUrl
    return status!.providers[p].configured
  }

  const live = liveModels[value.provider]
  const options = (live && live.length) ? live : MODEL_OPTIONS[value.provider]
  const isCustom = !options.includes(value.model)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={value.provider} onChange={e => onProvider(e.target.value as ProviderName)} style={controlStyle}>
          {PROVIDER_ORDER.map(p => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}{configuredFor(p) ? '' : ' (not connected)'}</option>
          ))}
        </select>

        {options.length > 0 && (
          <select
            value={isCustom ? CUSTOM : value.model}
            onChange={e => { const v = e.target.value; save({ ...value, model: v === CUSTOM ? '' : v }) }}
            style={{ ...controlStyle, flex: 1, minWidth: 160 }}
          >
            {options.map(m => <option key={m} value={m}>{m}</option>)}
            <option value={CUSTOM}>Custom...</option>
          </select>
        )}
      </div>

      {(isCustom || options.length === 0) && (
        <input
          value={value.model}
          onChange={e => save({ ...value, model: e.target.value })}
          placeholder={value.provider === 'local' ? 'model name (e.g. llama3.1)' : 'exact model id'}
          style={{ ...controlStyle, height: 32 }}
        />
      )}

      {!configuredFor(value.provider) && (
        <p style={{ fontSize: 11, color: 'var(--semantic-warning)', margin: 0, lineHeight: 1.4 }}>
          {value.provider === 'local'
            ? 'Set a local endpoint in Settings to use this.'
            : `Add a ${PROVIDER_LABELS[value.provider]} key in Settings to use this.`}
        </p>
      )}
    </div>
  )
}
