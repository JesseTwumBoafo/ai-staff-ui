import { useState, useEffect, useCallback } from 'react'
import { Server, FileText, ClipboardList, Clock, BookOpen, RefreshCw, FolderOpen, Rocket, AlertTriangle, X } from 'lucide-react'
import type { Agent, FolderAccess, VaultStatus, VaultRosterRow, VaultTaskRow, VaultSessionRef } from '../data/types'
import { folderNameFromPath } from '../folders'
import { parseTeamIndex, parseTaskTable, parseSessionRefs, joinPath, rosterDrifted, updateRosterInTeamIndex } from '../vault'

interface VaultViewProps {
  team: Agent[]
  onOpenDeploy: () => void
  onToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  onConnect: (folder: FolderAccess) => void
}

type LedgerState = 'ok' | 'empty' | 'toolarge' | 'error'

export function VaultView({ team, onOpenDeploy, onToast, onConnect }: VaultViewProps) {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [roster, setRoster] = useState<VaultRosterRow[]>([])
  const [drift, setDrift] = useState(false)
  const [ledgerState, setLedgerState] = useState<LedgerState>('empty')
  const [tasks, setTasks] = useState<VaultTaskRow[]>([])
  const [sessions, setSessions] = useState<VaultSessionRef[]>([])
  const [sops, setSops] = useState<string[]>([])
  const [outputs, setOutputs] = useState<string[]>([])
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const api = window.electronAPI
    setLoading(true)
    if (!api) { setStatus({ configured: false, exists: false, hasTeamIndex: false, hasLedger: false, hasSessions: false }); setLoading(false); return }
    const st = await api.vaultStatus()
    setStatus(st)
    if (!st.configured || !st.exists || !st.agentRoot) { setLoading(false); return }
    const ar = st.agentRoot

    const ti = await api.readFile(joinPath(ar, 'team', 'team_index.md'))
    if (ti.ok && ti.content) {
      const r = parseTeamIndex(ti.content)
      setRoster(r)
      setDrift(rosterDrifted(team.map(a => a.name), r))
    } else { setRoster([]); setDrift(false) }

    const led = await api.readFile(joinPath(ar, 'bkm', 'tasks', 'open.md'))
    if (!led.ok) {
      setLedgerState(led.error && /too large/i.test(led.error) ? 'toolarge' : 'error')
      setTasks([])
    } else {
      const t = parseTaskTable(led.content || '')
      setTasks(t)
      setLedgerState(t.length ? 'ok' : 'empty')
    }

    const sess = await api.listFolder(joinPath(ar, 'bkm', 'sessions'))
    setSessions(sess.ok ? parseSessionRefs((sess.entries || []).filter(e => !e.isDirectory).map(e => e.name)).slice(0, 5) : [])

    const sopList = await api.listFolder(joinPath(ar, 'bkm', 'sops'))
    setSops(sopList.ok ? (sopList.entries || []).filter(e => !e.isDirectory && e.name.toLowerCase().endsWith('.md')).map(e => e.name) : [])

    const outs = await api.listFolder(joinPath(ar, '6. Outputs', 'drafts', 'written'))
    setOutputs(outs.ok ? (outs.entries || []).filter(e => !e.isDirectory).map(e => e.name).slice(0, 8) : [])

    setLoading(false)
  }, [team])

  useEffect(() => { load() }, [load])

  async function openFile(dirParts: string[], fileName: string, title: string) {
    const api = window.electronAPI
    if (!api || !status?.agentRoot) return
    const res = await api.readFile(joinPath(status.agentRoot, ...dirParts, fileName))
    setPreview({ title, content: res.ok ? (res.content || '') : (res.error || 'Could not read this file.') })
  }

  async function pointAtExisting() {
    const api = window.electronAPI
    if (!api) return
    const picked = await api.pickFolder()
    if (picked.canceled || !picked.path) return
    const res = await api.setVaultRoot(picked.path)
    if (!res.ok) { onToast(res.error || 'Could not set the vault location', 'error'); return }
    onConnect({ name: folderNameFromPath(picked.path), path: picked.path, permission: 'read-write', connected: true })
    onToast('Vault location set', 'success')
    load()
  }

  async function rewriteRoster() {
    const api = window.electronAPI
    if (!api || !status?.agentRoot) return
    setBusy(true)
    try {
      const existing = await api.readFile(joinPath(status.agentRoot, 'team', 'team_index.md'))
      if (!existing.ok) { onToast('Could not read the roster file', 'error'); return }
      const date = new Date().toISOString().slice(0, 10)
      const appRoster: VaultRosterRow[] = team.map(a => ({ name: a.name, role: a.role, lane: a.lane, status: a.status, hired: date }))
      const updated = updateRosterInTeamIndex(existing.content || '', appRoster, date)
      const res = await api.writeFile(joinPath(status.agentRoot, 'team'), 'team_index.md', updated)
      if (res.ok) { onToast('Vault roster updated', 'success'); load() }
      else { onToast(res.error || 'Could not update the roster', 'error') }
    } finally { setBusy(false) }
  }

  const configured = status?.configured && status?.exists

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 24px', borderBottom: '1px solid var(--border-strong)', background: 'var(--surface-header)',
      }}>
        <Server size={16} style={{ color: 'var(--accent-primary)' }} />
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, flex: 1 }}>Operating System</h1>
        {configured && (
          <button className="btn-secondary" style={{ height: 30 }} onClick={load} disabled={loading}>
            <RefreshCw size={13} style={{ marginRight: 6 }} /> Refresh
          </button>
        )}
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>
        {loading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</p>}

        {/* Not configured: deploy entry point */}
        {!loading && !status?.configured && (
          <EmptyState
            title="No operating system connected"
            body="Deploy a fresh operating system into a folder, or point the app at a vault you already have."
            primaryLabel="Deploy your operating system"
            onPrimary={onOpenDeploy}
            secondaryLabel="Point at an existing vault"
            onSecondary={pointAtExisting}
          />
        )}

        {/* Configured but the folder is missing on disk */}
        {!loading && status?.configured && !status?.exists && (
          <EmptyState
            title="The vault folder is missing"
            body={`The app is pointed at ${status.root || 'a folder'}, but it is not there any more. It may have been moved or renamed. Re-deploy, or point the app at the folder again.`}
            primaryLabel="Deploy again"
            onPrimary={onOpenDeploy}
            secondaryLabel="Point at the folder"
            onSecondary={pointAtExisting}
            warn
          />
        )}

        {!loading && configured && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 760 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, wordBreak: 'break-all' }}>{status?.root}</p>

            {/* Roster */}
            <Section icon={<FileText size={14} />} title="Roster" count={roster.length}>
              {drift && (
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', marginBottom: 10,
                  background: 'var(--surface-sidebar)', border: '1px solid var(--semantic-warning)', borderRadius: 6,
                }}>
                  <AlertTriangle size={14} style={{ color: 'var(--semantic-warning)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                    The app roster and the deployed roster differ.
                  </span>
                  <button className="btn-secondary" style={{ height: 28 }} onClick={rewriteRoster} disabled={busy}>
                    Update vault roster
                  </button>
                </div>
              )}
              {roster.length === 0
                ? <Muted text="No roster found in the deployed vault." />
                : roster.map((r, i) => (
                  <Row key={i} left={r.name} mid={r.role} right={r.lane} />
                ))}
            </Section>

            {/* Open tasks */}
            <Section icon={<ClipboardList size={14} />} title="Open tasks" count={ledgerState === 'ok' ? tasks.length : undefined}>
              {ledgerState === 'toolarge' && <Muted text="The ledger is too large to preview here. Open it in your editor." />}
              {ledgerState === 'error' && <Muted text="Could not read the ledger." />}
              {ledgerState === 'empty' && <Muted text="No open tasks." />}
              {ledgerState === 'ok' && tasks.slice(0, 12).map((t, i) => (
                <Row key={i} left={t.id} mid={t.title} right={t.status} />
              ))}
            </Section>

            {/* Recent sessions */}
            <Section icon={<Clock size={14} />} title="Recent sessions" count={sessions.length}>
              {sessions.length === 0
                ? <Muted text="No session logs yet. Completed runs are logged here." />
                : sessions.map(s => (
                  <button key={s.fileName} className="sidebar-row" onClick={() => openFile(['bkm', 'sessions'], s.fileName, s.fileName)}
                    style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '6px 8px', borderRadius: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 92, flexShrink: 0 }}>{s.date || '—'}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{s.title}</span>
                  </button>
                ))}
            </Section>

            {/* SOPs */}
            <Section icon={<BookOpen size={14} />} title="SOPs" count={sops.length}>
              {sops.length === 0
                ? <Muted text="No SOPs found." />
                : sops.map(name => (
                  <button key={name} className="sidebar-row" onClick={() => openFile(['bkm', 'sops'], name, name)}
                    style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '6px 8px', borderRadius: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{name}</span>
                  </button>
                ))}
            </Section>

            {/* Recent outputs */}
            <Section icon={<FolderOpen size={14} />} title="Recent outputs" count={outputs.length}>
              {outputs.length === 0
                ? <Muted text="No deliverables yet. Approved run outputs land here." />
                : outputs.map(name => (
                  <button key={name} className="sidebar-row" onClick={() => openFile(['6. Outputs', 'drafts', 'written'], name, name)}
                    style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '6px 8px', borderRadius: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{name}</span>
                  </button>
                ))}
            </Section>
          </div>
        )}
      </div>

      {/* File preview */}
      {preview && (
        <div role="dialog" aria-modal="true" onClick={() => setPreview(null)} style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)', padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(720px, 100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--surface-content)', border: '1px solid var(--border-strong)', borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.title}</span>
              <button aria-label="Close" onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div className="scroll-region" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono, monospace)' }}>{preview.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{title}</span>
        {typeof count === 'number' && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({count})</span>}
      </div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function Row({ left, mid, right }: { left: string; mid: string; right: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mid}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{right}</span>
    </div>
  )
}

function Muted({ text }: { text: string }) {
  return <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{text}</div>
}

function EmptyState({ title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary, warn }:
  { title: string; body: string; primaryLabel: string; onPrimary: () => void; secondaryLabel: string; onSecondary: () => void; warn?: boolean }) {
  return (
    <div style={{ maxWidth: 460, margin: '40px auto 0', textAlign: 'center' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-sidebar)', border: `1px solid ${warn ? 'var(--semantic-warning)' : 'var(--border-strong)'}`,
      }}>
        {warn ? <AlertTriangle size={22} style={{ color: 'var(--semantic-warning)' }} /> : <Rocket size={22} style={{ color: 'var(--accent-primary)' }} />}
      </div>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>{title}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn-primary" style={{ height: 34 }} onClick={onPrimary}>{primaryLabel}</button>
        <button className="btn-secondary" style={{ height: 34 }} onClick={onSecondary}>{secondaryLabel}</button>
      </div>
    </div>
  )
}
