import { useState, useRef, useEffect } from 'react'
import { Pause, Archive, UserX, Play, ArrowLeft, Pencil, Check, X } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { StatusBadge } from '../components/StatusBadge'
import { ConfirmModal } from '../components/ConfirmModal'
import { RoleModelPicker } from '../components/RoleModelPicker'
import type { Agent, AgentStatus } from '../data/types'
import { validateName, NAME_MAX_LENGTH, resolveNames, namesFromTeam } from '../names'

interface ProfileViewProps {
  agent: Agent
  onBack: () => void
  onStatusChange: (agentId: string, status: AgentStatus) => void
  onRename: (agentId: string, newName: string) => void
  activeTeam: Agent[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
      color: 'var(--text-muted)', marginBottom: 8, marginTop: 0,
    }}>{children}</p>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '16px 0' }} />
}

export function ProfileView({ agent, onBack, onStatusChange, onRename, activeTeam }: ProfileViewProps) {
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Focus input when rename mode opens.
  useEffect(() => {
    if (renaming) {
      setTimeout(() => renameInputRef.current?.focus(), 10)
    }
  }, [renaming])

  // Reset rename state when agent changes.
  useEffect(() => {
    setRenaming(false)
    setRenameValue('')
    setRenameError(null)
  }, [agent.id])

  function startRename() {
    setRenameValue(agent.name)
    setRenameError(null)
    setRenaming(true)
  }

  function cancelRename() {
    setRenaming(false)
    setRenameValue('')
    setRenameError(null)
  }

  function confirmRename() {
    const err = validateName(renameValue, agent.id, activeTeam)
    if (err) { setRenameError(err); return }
    onRename(agent.id, renameValue.trim())
    setRenaming(false)
    setRenameError(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); confirmRename() }
    if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
  }

  // Resolve {{agentId}} tokens in scripted copy to current team names.
  const nameById = namesFromTeam(activeTeam)

  const permissionSentence = (folderAccess: Agent['folderAccess']) => {
    const read = folderAccess.filter(f => f.permission === 'read').map(f => f.name)
    const write = folderAccess.filter(f => f.permission === 'read-write').map(f => f.name)
    const parts: string[] = []
    if (read.length) parts.push(`can read your ${read.join(' and ')} ${read.length === 1 ? 'folder' : 'folders'}`)
    if (write.length) parts.push(`can read and write to your ${write.join(' and ')} ${write.length === 1 ? 'folder' : 'folders'}`)
    if (!read.length && !write.length) return `${agent.name} has no folder access at the moment.`
    return `${agent.name} ${parts.join(', ')} and cannot access anything else.`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
        background: 'var(--surface-header)', gap: 12,
      }}>
        <button
          className="btn-secondary"
          onClick={onBack}
          style={{ gap: 4 }}
        >
          <ArrowLeft size={12} /> Team
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{agent.name}</span>
        <StatusBadge status={agent.status} />
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>
        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <Avatar initials={agent.avatarInitials} colour={agent.avatarColour} size="xl" showPresence presenceActive={agent.status === 'active'} />
          <div style={{ flex: 1, paddingTop: 2 }}>
            {renaming ? (
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => { setRenameValue(e.target.value); setRenameError(null) }}
                    onKeyDown={handleRenameKeyDown}
                    maxLength={NAME_MAX_LENGTH}
                    style={{
                      fontSize: 18, fontWeight: 600, color: 'var(--text-primary)',
                      border: '1px solid var(--accent-primary)', borderRadius: 6,
                      padding: '2px 8px', background: 'var(--surface-content)',
                      fontFamily: 'inherit', outline: 'none', width: 180,
                      boxShadow: '0 0 0 2px var(--state-active)',
                    }}
                  />
                  <button
                    onClick={confirmRename}
                    title="Confirm"
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)',
                      background: 'var(--surface-sidebar)', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: 'var(--semantic-success)',
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={cancelRename}
                    title="Cancel"
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)',
                      background: 'var(--surface-sidebar)', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
                {renameError && (
                  <p style={{ fontSize: 12, color: 'var(--semantic-error)', margin: '4px 0 0', lineHeight: 1.4 }}>
                    {renameError}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{agent.name}</h1>
                {agent.isOrchestrator && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)',
                    background: 'var(--state-active)', borderRadius: 4, padding: '1px 6px',
                  }}>Manager</span>
                )}
                <button
                  onClick={startRename}
                  title="Edit name"
                  style={{
                    width: 24, height: 24, borderRadius: 4, border: '1px solid transparent',
                    background: 'transparent', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                    transition: 'color 100ms ease, background 100ms ease, border-color 100ms ease',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'var(--text-secondary)'
                    el.style.background = 'var(--state-hover)'
                    el.style.borderColor = 'var(--border-subtle)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'var(--text-muted)'
                    el.style.background = 'transparent'
                    el.style.borderColor = 'transparent'
                  }}
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{agent.role}</p>
          </div>
        </div>

        <Divider />

        {/* Model assignment */}
        {window.electronAPI && (
          <>
            <SectionLabel>Model</SectionLabel>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 10px' }}>
              Choose which provider and model {agent.name} runs on.
            </p>
            <div style={{ marginBottom: 16 }}>
              <RoleModelPicker role={agent.id} />
            </div>
            <Divider />
          </>
        )}

        {/* What they do */}
        <SectionLabel>What {agent.name} does</SectionLabel>
        <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agent.whatIDo.map((item, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0, marginTop: 5 }} />
              {resolveNames(item, nameById)}
            </li>
          ))}
        </ul>

        {/* What they will not do */}
        <SectionLabel>What {agent.name} will not do</SectionLabel>
        <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agent.whatIWillNotDo.map((item, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--semantic-error)', flexShrink: 0, marginTop: 5 }} />
              {resolveNames(item, nameById)}
            </li>
          ))}
        </ul>

        <Divider />

        {/* Folder access */}
        <SectionLabel>Folder access</SectionLabel>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10, marginTop: 0 }}>
          {permissionSentence(agent.folderAccess)}
        </p>
        {agent.folderAccess.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {agent.folderAccess.map(f => (
              <div key={f.name} style={{
                background: 'var(--surface-sidebar)', border: '1px solid var(--border-subtle)',
                borderRadius: 4, padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{f.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>{f.permission === 'read' ? 'Read only' : 'Read and write'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent work */}
        {agent.recentWork.length > 0 && (
          <>
            <Divider />
            <SectionLabel>Recent work</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {agent.recentWork.map(work => (
                <div key={work.id} style={{ paddingLeft: 14, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--border-strong)' }} />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px', fontWeight: 500 }}>{work.date}</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 2px', lineHeight: 1.4 }}>{work.brief}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{resolveNames(work.outcome, nameById)}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Lifecycle controls */}
        {!agent.isOrchestrator && (
          <>
            <Divider />
            <SectionLabel>Manage {agent.name}</SectionLabel>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 0, lineHeight: 1.5 }}>
              Changes to status are reversible until retirement, which revokes access permanently. History is preserved at every stage.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {agent.status === 'active' && (
                <button
                  className="btn-secondary"
                  style={{ height: 32, color: 'var(--semantic-warning)', borderColor: '#f7d8a0' }}
                  onClick={() => onStatusChange(agent.id, 'paused')}
                >
                  <Pause size={12} /> Pause {agent.name}
                </button>
              )}
              {agent.status === 'paused' && (
                <button
                  className="btn-secondary"
                  style={{ height: 32, color: 'var(--semantic-success)', borderColor: '#b8e8cf' }}
                  onClick={() => onStatusChange(agent.id, 'active')}
                >
                  <Play size={12} /> Reactivate {agent.name}
                </button>
              )}
              {(agent.status === 'active' || agent.status === 'paused') && (
                <button
                  className="btn-secondary"
                  style={{ height: 32 }}
                  onClick={() => onStatusChange(agent.id, 'archived')}
                >
                  <Archive size={12} /> Archive {agent.name}
                </button>
              )}
              {agent.status === 'archived' && (
                <>
                  <button
                    className="btn-secondary"
                    style={{ height: 32, color: 'var(--semantic-success)', borderColor: '#b8e8cf' }}
                    onClick={() => onStatusChange(agent.id, 'active')}
                  >
                    <Play size={12} /> Restore {agent.name}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ height: 32, color: 'var(--semantic-error)', borderColor: '#f5c0bb' }}
                    onClick={() => setConfirmRetire(true)}
                  >
                    <UserX size={12} /> Retire {agent.name}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {confirmRetire && (
        <ConfirmModal
          title={`Retire ${agent.name}?`}
          message="This revokes access permanently. History is preserved, but this cannot be undone."
          confirmLabel={`Retire ${agent.name}`}
          dangerous
          onConfirm={() => { onStatusChange(agent.id, 'retired'); setConfirmRetire(false) }}
          onCancel={() => setConfirmRetire(false)}
        />
      )}
    </div>
  )
}
