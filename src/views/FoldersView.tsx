import { useState } from 'react'
import { CheckCircle, Folder, Lock, Eye, Edit3, ArrowLeft, Check, Trash2, FolderOpen } from 'lucide-react'
import type { FolderAccess } from '../data/types'
import { folderNameFromPath } from '../folders'

interface FoldersViewProps {
  folders: FolderAccess[]
  onConnect: (folder: FolderAccess) => void
  onDisconnect: (folder: FolderAccess) => void
}

type ConnectStep = 'manual-entry' | 'set-scope' | 'confirm' | 'done'

const electronAPI = window.electronAPI
const isElectron = Boolean(electronAPI)

export function FoldersView({ folders, onConnect, onDisconnect }: FoldersViewProps) {
  const [connectingNew, setConnectingNew] = useState(false)
  const [step, setStep] = useState<ConnectStep>('set-scope')
  const [pickedPath, setPickedPath] = useState('')
  const [folderName, setFolderName] = useState('')
  const [permission, setPermission] = useState<'read' | 'read-write'>('read')
  const [pickError, setPickError] = useState<string | null>(null)

  function reset() {
    setConnectingNew(false)
    setStep('set-scope')
    setPickedPath('')
    setFolderName('')
    setPermission('read')
    setPickError(null)
  }

  async function startConnect() {
    setPickError(null)
    if (electronAPI) {
      try {
        const res = await electronAPI.pickFolder()
        if (res.canceled || !res.path) return
        setPickedPath(res.path)
        setFolderName(folderNameFromPath(res.path))
        setPermission('read')
        setConnectingNew(true)
        setStep('set-scope')
      } catch (err) {
        setPickError(String((err as Error)?.message ?? err))
      }
    } else {
      // Browser fallback: no native picker, accept a typed folder name.
      setPickedPath('')
      setFolderName('')
      setPermission('read')
      setConnectingNew(true)
      setStep('manual-entry')
    }
  }

  function finish() {
    onConnect({
      name: folderName.trim() || (pickedPath ? folderNameFromPath(pickedPath) : 'Folder'),
      path: pickedPath || undefined,
      permission,
      connected: true,
    })
    setStep('done')
  }

  const headerBar = (title: string, onBack?: () => void) => (
    <div style={{
      height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
      padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
      background: 'var(--surface-header)', gap: 12,
    }}>
      {onBack && (
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={12} /> Folders
        </button>
      )}
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
    </div>
  )

  if (connectingNew) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {step === 'manual-entry' && headerBar('Name a folder', reset)}
        {step === 'set-scope' && headerBar(`Permissions for ${folderName}`, reset)}
        {step === 'confirm' && headerBar('Confirm connection', () => setStep('set-scope'))}
        {step === 'done' && headerBar('Connected')}

        <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>

          {step === 'manual-entry' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 0, lineHeight: 1.5 }}>
                The native folder picker is only available in the desktop app. Enter a folder name to continue in preview mode.
              </p>
              <input
                autoFocus
                value={folderName}
                onChange={e => setFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && folderName.trim()) setStep('set-scope') }}
                placeholder="Folder name"
                style={{
                  width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px',
                  border: '1px solid var(--border-subtle)', borderRadius: 4, fontSize: 13,
                  color: 'var(--text-primary)', background: 'var(--surface-content)',
                  fontFamily: 'inherit', outline: 'none', marginBottom: 16,
                }}
              />
              <button className="btn-primary" disabled={!folderName.trim()} onClick={() => setStep('set-scope')}>
                Continue
              </button>
            </>
          )}

          {step === 'set-scope' && (
            <>
              {pickedPath && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
                  background: 'var(--surface-sidebar)', border: '1px solid var(--border-subtle)',
                  borderRadius: 4, padding: '8px 12px',
                }}>
                  <FolderOpen size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{pickedPath}</span>
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0, lineHeight: 1.5 }}>
                Start with read-only. You can broaden access later when you are confident.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {([['read', 'Read only', 'Your team can read files but cannot change anything.', Eye], ['read-write', 'Read and write', 'Your team can read files and save new ones. They will ask before overwriting anything.', Edit3]] as const).map(([val, label, desc, Icon]) => (
                  <button
                    key={val}
                    onClick={() => setPermission(val)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      border: permission === val ? '1px solid var(--state-active)' : '1px solid var(--border-subtle)',
                      borderRadius: 4, cursor: 'pointer', background: permission === val ? 'var(--state-hover)' : 'transparent',
                      textAlign: 'left', fontFamily: 'inherit',
                      transition: 'background-color 50ms ease-in',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                      background: permission === val ? 'var(--state-active)' : 'var(--surface-sidebar)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={14} style={{ color: permission === val ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 2px' }}>{label}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{desc}</p>
                    </div>
                    {permission === val && <Check size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
                  </button>
                ))}
              </div>
              <div style={{
                background: 'var(--surface-sidebar)', borderRadius: 4, padding: '8px 12px',
                marginBottom: 16, border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <Lock size={12} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Your team can {permission === 'read' ? 'read' : 'read and write to'} your <strong>{folderName}</strong> folder and cannot access anything else.
                </p>
              </div>
              <button className="btn-primary" onClick={() => setStep('confirm')}>Continue</button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0, lineHeight: 1.5 }}>
                Review what you are granting before connecting.
              </p>
              <div style={{
                background: 'var(--state-hover)', border: '1px solid var(--state-active)',
                borderRadius: 4, padding: '12px 14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                  Your team will be able to <strong>{permission === 'read' ? 'read' : 'read and write to'}</strong> your{' '}
                  <strong>{folderName}</strong> folder. They cannot access anything outside this folder.
                  You can change or remove this access at any time.
                </p>
                {pickedPath && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', wordBreak: 'break-all' }}>{pickedPath}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={finish}>
                  <CheckCircle size={13} /> Connect {folderName}
                </button>
                <button className="btn-secondary" style={{ height: 32 }} onClick={() => setStep('set-scope')}>Back</button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', paddingTop: 32 }}>
              <div style={{
                width: 40, height: 40, background: '#e8f7ef', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                border: '1px solid #b8e8cf',
              }}>
                <CheckCircle size={20} style={{ color: 'var(--semantic-success)' }} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{folderName} connected</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 auto 20px', maxWidth: 280 }}>
                Your team can now access {folderName}. The feed will show what was read and written after each run.
              </p>
              <button className="btn-primary" onClick={reset}>Back to folders</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main folders view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
        background: 'var(--surface-header)',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Connected folders</h1>
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '16px 24px' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0, lineHeight: 1.5 }}>
          Your files stay on your own machine. Connect a folder to give your team real read or write access to it.
        </p>

        {pickError && (
          <div style={{
            border: '1px solid var(--semantic-error)', borderRadius: 6, padding: '10px 12px',
            marginBottom: 12, fontSize: 12, color: 'var(--semantic-error)',
          }}>
            Could not open the folder picker: {pickError}
          </div>
        )}

        {folders.length === 0 && (
          <div style={{
            border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '40px 24px',
            textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{
              width: 36, height: 36, background: 'var(--surface-sidebar)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px',
            }}>
              <Folder size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 4px' }}>No folders connected yet</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Connect a folder to give your team something to work with.</p>
          </div>
        )}

        {folders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 16 }}>
            {folders.map(folder => (
              <div key={folder.path ?? folder.name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 44,
                border: '1px solid var(--border-subtle)', borderRadius: 4, background: 'transparent',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 4, background: 'var(--state-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Folder size={14} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{folder.name}</span>
                    {folder.connected && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--semantic-success)',
                        background: '#e8f7ef', borderRadius: 4, padding: '0 5px',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span className="status-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--semantic-success)', display: 'inline-block' }} />
                        Connected
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', wordBreak: 'break-all' }}>
                    {folder.path ?? (folder.permission === 'read' ? 'Your team can read this folder.' : 'Your team can read and write to this folder.')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {folder.permission === 'read' ? (
                    <Eye size={12} style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <Edit3 size={12} style={{ color: 'var(--text-muted)' }} />
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{folder.permission === 'read' ? 'Read' : 'Read + write'}</span>
                </div>
                <button
                  onClick={() => onDisconnect(folder)}
                  title={`Disconnect ${folder.name}`}
                  style={{
                    width: 28, height: 28, borderRadius: 4, border: '1px solid transparent',
                    background: 'transparent', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'var(--semantic-error)'
                    el.style.background = 'var(--state-hover)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'var(--text-muted)'
                    el.style.background = 'transparent'
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          style={{
            width: '100%', border: '1px dashed var(--border-strong)', borderRadius: 6,
            padding: '10px 0', fontSize: 13, fontWeight: 500, color: 'var(--accent-primary)',
            background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background-color 50ms ease-in',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--state-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          onClick={startConnect}
        >
          <FolderOpen size={14} />
          {isElectron ? 'Connect a folder' : 'Connect a folder (preview)'}
        </button>
      </div>
    </div>
  )
}
