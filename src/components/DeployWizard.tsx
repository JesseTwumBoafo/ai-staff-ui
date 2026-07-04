import { useState } from 'react'
import { X, FolderPlus, CheckCircle, AlertTriangle } from 'lucide-react'
import type { Agent, DeployPlan, DeployResult, VaultRosterRow } from '../data/types'
import { folderNameFromPath } from '../folders'

interface DeployWizardProps {
  open: boolean
  onClose: () => void
  team: Agent[]
  onConnect: (folder: { name: string; path: string; permission: 'read-write'; connected: true }) => void
  onToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
  // Phase 3 hook: refresh the Operating System view after a deploy.
  onDeployed?: () => void
}

type Phase = 'intro' | 'planning' | 'plan' | 'applying' | 'done'

// Build the roster rows the deploy engine writes into team_index.md. Hired date
// is the deploy date; the persona column is fixed to "in-app agent" in the engine.
function rosterFromTeam(team: Agent[]): VaultRosterRow[] {
  const hired = new Date().toISOString().slice(0, 10)
  return team.map(a => ({ name: a.name, role: a.role, lane: a.lane, status: a.status, hired }))
}

export function DeployWizard({ open, onClose, team, onConnect, onToast, onDeployed }: DeployWizardProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [ownerName, setOwnerName] = useState('')
  const [root, setRoot] = useState('')
  const [plan, setPlan] = useState<DeployPlan | null>(null)
  const [result, setResult] = useState<DeployResult | null>(null)
  const [error, setError] = useState('')

  if (!open) return null

  const api = window.electronAPI

  function reset() {
    setPhase('intro'); setRoot(''); setPlan(null); setResult(null); setError('')
  }
  function close() { reset(); onClose() }

  async function pickAndPlan() {
    if (!api) return
    setError('')
    try {
      const picked = await api.pickFolder()
      if (picked.canceled || !picked.path) return
      setRoot(picked.path)
      setPhase('planning')
      const p = await api.deployPlan(picked.path)
      setPlan(p)
      setPhase('plan')
    } catch (err) {
      setError(String((err as Error)?.message || err))
      setPhase('intro')
    }
  }

  async function apply() {
    if (!api || !root) return
    setPhase('applying')
    setError('')
    try {
      const res = await api.deployApply(root, ownerName.trim() || 'Owner', rosterFromTeam(team))
      setResult(res)
      setPhase('done')
      if (res.ok) {
        onConnect({ name: folderNameFromPath(root), path: root, permission: 'read-write', connected: true })
        onToast('Operating system deployed', 'success')
        onDeployed?.()
      } else {
        onToast('Deploy finished with errors', 'warning')
      }
    } catch (err) {
      setError(String((err as Error)?.message || err))
      setPhase('plan')
    }
  }

  const createCount = plan ? plan.entries.filter(e => e.action === 'create').length : 0
  const keepCount = plan ? plan.entries.filter(e => e.action === 'keep').length : 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deploy your operating system"
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)', padding: 24,
      }}
      onClick={close}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '100%', overflow: 'auto',
          background: 'var(--surface-content)', border: '1px solid var(--border-strong)',
          borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <FolderPlus size={18} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
            Deploy your operating system
          </h2>
          <button aria-label="Close" onClick={close} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {!api && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Deploying an operating system needs the desktop app. Open Your AI Staff on your computer to use this.
            </p>
          )}

          {api && phase === 'intro' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0 }}>
                This sets up a complete operating system in a folder you choose: the numbered
                pillars, an agent workspace, your roster, a task ledger, and an outputs pipeline.
                Nothing existing is overwritten. If you pick a folder that already has an operating
                system, only what is missing gets created.
              </p>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
                Your first name (used in the generated files)
              </label>
              <input
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="Owner"
                style={{
                  width: '100%', height: 34, padding: '0 10px', fontSize: 13, boxSizing: 'border-box',
                  border: '1px solid var(--border-strong)', borderRadius: 6,
                  background: 'var(--surface-sidebar)', color: 'var(--text-primary)', fontFamily: 'inherit',
                  marginBottom: 16,
                }}
              />
              {error && <p style={{ fontSize: 12, color: 'var(--semantic-error)', margin: '0 0 12px' }}>{error}</p>}
              <button className="btn-primary" style={{ height: 34 }} onClick={pickAndPlan}>
                Choose a folder and continue
              </button>
            </div>
          )}

          {api && phase === 'planning' && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Checking the folder...</p>
          )}

          {api && phase === 'plan' && plan && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>Target folder</p>
              <p style={{
                fontSize: 12, color: 'var(--text-primary)', margin: '0 0 16px', wordBreak: 'break-all',
                fontFamily: 'var(--font-mono, monospace)',
              }}>{plan.root}</p>

              {plan.warnings.map((w, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 12,
                  background: 'var(--surface-sidebar)', border: '1px solid var(--semantic-warning, #d97706)',
                  borderRadius: 6,
                }}>
                  <AlertTriangle size={15} style={{ color: 'var(--semantic-warning, #d97706)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{w}</span>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 20, marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent-primary)' }}>{createCount}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>to create</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-secondary)' }}>{keepCount}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>already there</div>
                </div>
              </div>

              {error && <p style={{ fontSize: 12, color: 'var(--semantic-error)', margin: '0 0 12px' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ height: 34 }} onClick={apply}>
                  {createCount > 0 ? `Deploy (${createCount} to create)` : 'Nothing to create'}
                </button>
                <button className="btn-secondary" style={{ height: 34 }} onClick={pickAndPlan}>
                  Choose a different folder
                </button>
              </div>
            </div>
          )}

          {api && phase === 'applying' && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Deploying...</p>
          )}

          {api && phase === 'done' && result && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <CheckCircle size={18} style={{ color: result.ok ? 'var(--semantic-success)' : 'var(--semantic-warning, #d97706)' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {result.ok ? 'Operating system deployed' : 'Deployed with some errors'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
                Created {result.created} item{result.created === 1 ? '' : 's'}, kept {result.kept} that already existed.
                The folder is now connected, so your team can read and write it.
              </p>
              {result.errors.length > 0 && (
                <ul style={{ fontSize: 12, color: 'var(--semantic-error)', margin: '0 0 12px', paddingLeft: 18 }}>
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              <button className="btn-primary" style={{ height: 34 }} onClick={close}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
