import { useState, useEffect, useRef } from 'react'
import { Search, Home, Users, Folder, Compass, Settings, UserPlus, User, Moon, Server } from 'lucide-react'
import type { AppView } from '../data/types'
import type { Agent } from '../data/types'
import { CANNED_BRIEFS } from '../data/flows'

interface PaletteAction {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNavigate: (view: AppView) => void
  onViewProfile: (agentId: string) => void
  onRunBrief: (flowId: string) => void
  onToggleDarkMode: () => void
  team: Agent[]
}

export function CommandPalette({ open, onClose, onNavigate, onViewProfile, onRunBrief, onToggleDarkMode, team }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const navActions: PaletteAction[] = [
    { id: 'nav-home', label: 'Go to Activity', description: 'Brief your team and watch activity', icon: <Home size={14} />, action: () => { onNavigate('home'); onClose() } },
    { id: 'nav-team', label: 'Go to Team', description: 'View your roster', icon: <Users size={14} />, action: () => { onNavigate('team'); onClose() } },
    { id: 'nav-vault', label: 'Go to Operating System', description: 'Your deployed vault: roster, tasks, sessions', icon: <Server size={14} />, action: () => { onNavigate('vault'); onClose() } },
    { id: 'nav-folders', label: 'Go to Folders', description: 'Manage connected folders', icon: <Folder size={14} />, action: () => { onNavigate('folders'); onClose() } },
    { id: 'nav-onboarding', label: 'Go to Setup guide', description: 'Onboarding checklist', icon: <Compass size={14} />, action: () => { onNavigate('onboarding'); onClose() } },
    { id: 'nav-hire', label: 'Add a specialist', description: 'Browse the hiring library', icon: <UserPlus size={14} />, action: () => { onNavigate('hire'); onClose() } },
    { id: 'nav-settings', label: 'Settings', description: 'App preferences', icon: <Settings size={14} />, action: () => { onNavigate('settings' as AppView); onClose() } },
    { id: 'theme-toggle', label: 'Toggle dark mode', description: 'Switch between light and dark', icon: <Moon size={14} />, action: () => { onToggleDarkMode(); onClose() } },
  ]

  const briefActions: PaletteAction[] = CANNED_BRIEFS.map(f => ({
    id: `brief-${f.id}`,
    label: f.label,
    description: 'Give this brief now',
    icon: <Home size={14} style={{ color: 'var(--accent-primary)' }} />,
    action: () => { onRunBrief(f.id); onNavigate('home'); onClose() },
  }))

  const teamActions: PaletteAction[] = team.map(a => ({
    id: `agent-${a.id}`,
    label: a.name,
    description: a.role,
    icon: <User size={14} />,
    action: () => { onViewProfile(a.id); onClose() },
  }))

  const allActions = [...navActions, ...briefActions, ...teamActions]

  const filtered = query.trim()
    ? allActions.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        (a.description || '').toLowerCase().includes(query.toLowerCase())
      )
    : allActions

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[selectedIdx]) { filtered[selectedIdx].action() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, selectedIdx, onClose])

  if (!open) return null

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-box" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          height: 44, borderBottom: '1px solid var(--border-subtle)',
        }}>
          <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search actions, team members, or briefs..."
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-sidebar)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 5px' }}>Esc</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 320, overflowY: 'auto' }} className="scroll-region">
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No results
            </div>
          )}
          {filtered.map((action, idx) => (
            <button
              key={action.id}
              onClick={action.action}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 14px', height: 36, border: 'none', cursor: 'pointer',
                background: idx === selectedIdx ? 'var(--state-hover)' : 'transparent',
                textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{action.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{action.label}</span>
                {action.description && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{action.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
