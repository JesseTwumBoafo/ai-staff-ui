import { useState, useEffect, useCallback } from 'react'
import { Home, Users, UserPlus, Folder, Compass, Settings, Plug, Server } from 'lucide-react'
import { HomeView } from './views/HomeView'
import { VaultView } from './views/VaultView'
import { TeamView } from './views/TeamView'
import { ProfileView } from './views/ProfileView'
import { HireView } from './views/HireView'
import { FoldersView } from './views/FoldersView'
import { ConnectionsView } from './views/ConnectionsView'
import { OnboardingView } from './views/OnboardingView'
import { CommandPalette } from './components/CommandPalette'
import { DeployWizard } from './components/DeployWizard'
import { ToastContainer } from './components/Toast'
import { INITIAL_TEAM } from './data/team'
import type { Agent, AgentStatus, AppView, FolderAccess, HiringCandidate, OnboardingState } from './data/types'
import type { ToastMessage } from './components/Toast'
import { getStoredTheme, storeTheme, applyTheme } from './theme'
import type { ThemePreference } from './theme'
import { TitleBar } from './components/TitleBar'
import { AIConnectionSettings } from './components/AIConnectionSettings'
import { getStoredNames, storeName, resetStoredNames } from './names'
import { getStoredFolders, storeFolders } from './folders'
import { getRuns } from './runs'

type NavView = 'home' | 'team' | 'folders' | 'connections' | 'onboarding' | 'hire' | 'settings' | 'vault'

const NAV_ITEMS: { id: NavView; label: string; Icon: typeof Home }[] = [
  { id: 'home', label: 'Activity', Icon: Home },
  { id: 'team', label: 'Team', Icon: Users },
  { id: 'vault', label: 'Operating System', Icon: Server },
  { id: 'folders', label: 'Folders', Icon: Folder },
  { id: 'connections', label: 'Connections', Icon: Plug },
]

let toastId = 0

// Hydrate INITIAL_TEAM with any stored custom names.
function hydrateTeam(): Agent[] {
  const stored = getStoredNames()
  return INITIAL_TEAM.map(a => {
    const customName = stored[a.id]
    if (!customName) return a
    return {
      ...a,
      name: customName,
      avatarInitials: customName.trim().charAt(0).toUpperCase(),
    }
  })
}

// Onboarding state is persisted so the app does not boot back to the Setup
// guide once the user has moved past setup.
const ONBOARDING_KEY = 'ai-staff-onboarding'
function loadOnboarding(): OnboardingState {
  const base: OnboardingState = {
    dismissed: false,
    folderConnected: getStoredFolders().length > 0,
    teamMet: false,
    firstBriefGiven: false,
  }
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return { ...base, ...parsed }
    }
  } catch {
    // ignore
  }
  return base
}
const VIEW_KEY = 'ai-staff-view'
const STABLE_VIEWS: AppView[] = ['home', 'team', 'vault', 'folders', 'connections', 'settings', 'onboarding']
function initialView(): AppView {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (v && STABLE_VIEWS.includes(v as AppView)) return v as AppView
  } catch {
    // ignore
  }
  const ob = loadOnboarding()
  return ob.dismissed || ob.firstBriefGiven || ob.folderConnected ? 'home' : 'onboarding'
}

export default function App() {
  const [view, setView] = useState<AppView>(initialView)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [team, setTeam] = useState<Agent[]>(hydrateTeam)
  const [folders, setFolders] = useState<FolderAccess[]>(getStoredFolders)
  const [onboarding, setOnboarding] = useState<OnboardingState>(loadOnboarding)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [initialFlowId, setInitialFlowId] = useState<string | null>(null)
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [runsVersion, setRunsVersion] = useState(0)
  const [deployOpen, setDeployOpen] = useState(false)
  const [themePref, setThemePref] = useState<ThemePreference>(getStoredTheme)

  // Apply theme on mount and when preference changes
  useEffect(() => {
    applyTheme(themePref)
    storeTheme(themePref)
  }, [themePref])

  // Persist connected folders whenever they change
  useEffect(() => {
    storeFolders(folders)
  }, [folders])

  // Persist onboarding progress so reloads do not return to the Setup guide.
  useEffect(() => {
    try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(onboarding)) } catch { /* ignore */ }
  }, [onboarding])

  // Remember the last stable view so a reload returns the user where they were.
  useEffect(() => {
    if (STABLE_VIEWS.includes(view)) {
      try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ }
    }
  }, [view])

  // Track which agents are currently working, for live mode on the Team page.
  const [liveAgents, setLiveAgents] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!window.electronAPI) return
    return window.electronAPI.onAgentEvent(ev => {
      if (ev.type === 'transcript') return
      setLiveAgents(prev => ({ ...prev, [ev.agentId]: Date.now() }))
    })
  }, [])
  useEffect(() => {
    const t = setInterval(() => {
      setLiveAgents(prev => {
        const now = Date.now()
        const next: Record<string, number> = {}
        let changed = false
        for (const [id, ts] of Object.entries(prev)) {
          if (now - ts < 2500) next[id] = ts
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])
  const liveAgentSet = new Set(Object.keys(liveAgents))

  // Keep in sync when system preference changes (only when pref = system)
  useEffect(() => {
    if (themePref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function onChange() { applyTheme('system') }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themePref])

  function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    setThemePref(isDark ? 'light' : 'dark')
  }

  // Pending review gates count for badge
  const pendingGates = 0

  // Cmd+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(p => !p)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        navigate('settings' as AppView)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${++toastId}`
    setToasts(prev => [...prev, { id, type, message }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  function navigate(v: AppView) {
    setView(v)
    setProfileId(null)
    if (v === 'team' && !onboarding.teamMet) {
      setOnboarding(prev => ({ ...prev, teamMet: true }))
    }
  }

  function viewProfile(agentId: string) {
    setProfileId(agentId)
    setView('profile')
  }

  function handleStatusChange(agentId: string, status: AgentStatus) {
    setTeam(prev => prev.map(a => a.id === agentId ? { ...a, status } : a))
    const agent = team.find(a => a.id === agentId)
    if (agent) {
      const msg = status === 'paused' ? `${agent.name} paused` :
        status === 'active' ? `${agent.name} reactivated` :
        status === 'archived' ? `${agent.name} archived` :
        `${agent.name} retired`
      addToast(msg, status === 'retired' ? 'warning' : 'success')
    }
  }

  function handleHire(candidate: HiringCandidate, selectedFolders: string[], chosenName?: string) {
    const finalName = (chosenName && chosenName.trim()) ? chosenName.trim() : candidate.name
    const newAgent: Agent = {
      id: candidate.id,
      name: finalName,
      avatarInitials: finalName.charAt(0).toUpperCase(),
      avatarColour: candidate.avatarColour,
      role: candidate.role,
      lane: candidate.lane,
      whatIDo: candidate.whatIDo,
      whatIWillNotDo: candidate.whatIWillNotDo,
      folderAccess: selectedFolders.map(f => ({ name: f, permission: 'read' as const, connected: true })),
      status: 'active',
      recentWork: [],
    }
    if (finalName !== candidate.name) {
      storeName(candidate.id, finalName)
    }
    setTeam(prev => [...prev, newAgent])
    addToast(`${finalName} added to your team`, 'success')
  }

  function handleRename(agentId: string, newName: string) {
    const trimmed = newName.trim()
    setTeam(prev => prev.map(a =>
      a.id === agentId
        ? { ...a, name: trimmed, avatarInitials: trimmed.charAt(0).toUpperCase() }
        : a
    ))
    storeName(agentId, trimmed)
    addToast('Name updated', 'success')
  }

  function handleResetNames() {
    resetStoredNames()
    setTeam(INITIAL_TEAM)
    addToast('Names reset to defaults', 'info')
  }

  function handleConnectFolder(folder: FolderAccess) {
    setFolders(prev => {
      // Identify an existing entry by real path when present, else by name.
      const matches = (f: FolderAccess) =>
        folder.path ? f.path === folder.path : f.name === folder.name && !f.path
      const exists = prev.some(matches)
      if (exists) return prev.map(f => matches(f) ? { ...f, ...folder, connected: true } : f)
      return [...prev, { ...folder, connected: true }]
    })
    setOnboarding(prev => ({ ...prev, folderConnected: true }))
    addToast(`${folder.name} connected`, 'success')
  }

  function handleDisconnectFolder(folder: FolderAccess) {
    setFolders(prev => prev.filter(f => (folder.path ? f.path !== folder.path : f.name !== folder.name)))
    addToast(`${folder.name} disconnected`, 'info')
  }

  function handleFirstBriefGiven() {
    setOnboarding(prev => ({ ...prev, firstBriefGiven: true }))
  }

  function handleDismissOnboarding() {
    setOnboarding(prev => ({ ...prev, dismissed: true }))
    setView('home')
  }

  function handleRunBrief(flowId: string) {
    setInitialFlowId(flowId)
    setView('home')
  }

  const profileAgent = profileId ? team.find(a => a.id === profileId) : null

  // Determine active rail item
  const activeRailItem: NavView = view === 'profile' ? 'team' : (view as NavView)

  // Sidebar content based on view
  function renderSidebar() {
    if (view === 'home') {
      // Home sidebar: saved run transcripts
      const savedRuns = getRuns()
      return (
        <div key={`runs-${runsVersion}`}>
          <div className="section-heading">Recent runs</div>
          <div style={{ padding: '4px 0' }}>
            {savedRuns.length === 0 && (
              <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Finished runs are saved here.
              </div>
            )}
            {savedRuns.map(run => (
              <button
                key={run.id}
                onClick={() => setOpenRunId(run.id)}
                className="sidebar-row"
                style={{
                  width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left', gap: 8, alignItems: 'flex-start',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0, marginTop: 6 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(run.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (view === 'team' || view === 'profile') {
      return (
        <div>
          <div className="section-heading">Roster</div>
          <div style={{ padding: '4px 0' }}>
            {team.map(agent => (
              <button
                key={agent.id}
                onClick={() => viewProfile(agent.id)}
                className={`sidebar-row ${profileId === agent.id || (view === 'team' && !profileId && false) ? 'active' : ''}`}
                style={{
                  width: '100%', border: 'none', background: profileId === agent.id ? 'var(--state-active)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', gap: 8,
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: agent.avatarColour, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 9, fontWeight: 600, color: '#fff',
                  }}>
                    {agent.avatarInitials}
                  </div>
                  <span
                    className={`presence-dot ${agent.status === 'active' ? 'active' : 'idle'}`}
                    style={{ width: 6, height: 6, bottom: -1, right: -1 }}
                  />
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'left' }}>{agent.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.role.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (view === 'folders') {
      return (
        <div>
          <div className="section-heading">Connected</div>
          <div style={{ padding: '4px 0' }}>
            {folders.filter(f => f.connected).map(f => (
              <div key={f.name} className="sidebar-row">
                <Folder size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>{f.name}</span>
                <span style={{ fontSize: 11, color: f.permission === 'read-write' ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  {f.permission === 'read' ? 'r' : 'rw'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (view === 'onboarding') {
      const stepsStatus = [
        { label: 'Connect a folder', done: onboarding.folderConnected },
        { label: 'Meet your team', done: onboarding.teamMet },
        { label: 'Give a brief', done: onboarding.firstBriefGiven },
      ]
      const done = stepsStatus.filter(s => s.done).length
      return (
        <div>
          <div className="section-heading">Progress</div>
          <div style={{ padding: '4px 12px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{done} of {stepsStatus.length} done</span>
            </div>
            <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{
                height: '100%', background: 'var(--accent-primary)', borderRadius: 2,
                width: `${(done / stepsStatus.length) * 100}%`, transition: 'width 700ms ease',
              }} />
            </div>
            {stepsStatus.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700,
                  background: s.done ? 'var(--semantic-success)' : 'var(--border-subtle)',
                  color: s.done ? '#fff' : 'var(--text-muted)',
                }}>
                  {s.done ? '✓' : i + 1}
                </span>
                <span style={{ fontSize: 12, color: s.done ? 'var(--semantic-success)' : 'var(--text-secondary)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (view === 'vault') {
      return (
        <div>
          <div className="section-heading">Operating System</div>
          <div style={{ padding: '4px 12px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Your deployed vault: roster, tasks, sessions, and outputs, read live from disk.
            </p>
          </div>
        </div>
      )
    }

    if (view === 'hire') {
      return (
        <div>
          <div className="section-heading">Library</div>
          <div style={{ padding: '4px 12px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Browse pre-built specialist roles below.
            </p>
          </div>
        </div>
      )
    }

    return null
  }

  // Show sidebar for all views except settings and connections (full-width)
  const showSidebar = view !== 'settings' && view !== 'connections'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: 'var(--surface-content)',
    }}>
      {/* Title bar (real in Electron, decorative in browser) */}
      <TitleBar currentView={view} />

      {/* Main shell: rail + sidebar + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Rail */}
        <div style={{
          width: 56, flexShrink: 0, background: 'var(--surface-rail)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 8,
        }}>
          {/* Nav icons */}
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeRailItem === id || (id === 'team' && view === 'hire')
            return (
              <button
                key={id}
                title={label}
                onClick={() => navigate(id as AppView)}
                className={`rail-icon-btn ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                {id === 'home' && pendingGates > 0 && (
                  <span className="badge-pill">{pendingGates}</span>
                )}
              </button>
            )
          })}

          {/* Hire - secondary item, shown inline with team */}
          <button
            title="Add a specialist"
            onClick={() => navigate('hire')}
            className={`rail-icon-btn ${view === 'hire' ? 'active' : ''}`}
          >
            <UserPlus size={20} />
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Configuration: Setup guide then Settings, grouped at the bottom */}
          <button
            title="Setup guide"
            onClick={() => navigate('onboarding')}
            className={`rail-icon-btn ${view === 'onboarding' ? 'active' : ''}`}
            style={{ marginBottom: 4 }}
          >
            <Compass size={20} />
          </button>
          <button
            title="Settings"
            onClick={() => navigate('settings' as AppView)}
            className={`rail-icon-btn ${view === 'settings' ? 'active' : ''}`}
            style={{ marginBottom: 8 }}
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div style={{
            width: 240, flexShrink: 0, background: 'var(--surface-sidebar)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div className="scroll-region" style={{ flex: 1, paddingTop: 8 }}>
              {renderSidebar()}
            </div>
          </div>
        )}

        {/* Main content well */}
        <div style={{
          flex: 1, background: 'var(--surface-content)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {view === 'onboarding' && (
            <OnboardingView
              onboarding={onboarding}
              onDismiss={handleDismissOnboarding}
              onGoTo={(v) => navigate(v as AppView)}
              onOpenDeploy={() => setDeployOpen(true)}
              team={team}
            />
          )}
          {view === 'home' && (
            <HomeView
              onboarding={onboarding}
              onFirstBriefGiven={handleFirstBriefGiven}
              initialFlowId={initialFlowId}
              onClearInitialFlow={() => setInitialFlowId(null)}
              teamNames={Object.fromEntries(team.map(a => [a.id, a.name]))}
              folders={folders}
              agents={team.filter(a => a.status === 'active').map(a => ({ id: a.id, name: a.name, role: a.role, whatIDo: a.whatIDo }))}
              openRunId={openRunId}
              onClearOpenRun={() => setOpenRunId(null)}
              onRunSaved={() => setRunsVersion(v => v + 1)}
            />
          )}
          {view === 'team' && (
            <TeamView team={team} onViewProfile={viewProfile} selectedAgentId={profileId} liveAgents={liveAgentSet} onHire={() => navigate('hire')} />
          )}
          {view === 'vault' && (
            <VaultView team={team} onOpenDeploy={() => setDeployOpen(true)} onToast={addToast} onConnect={handleConnectFolder} />
          )}
          {view === 'profile' && profileAgent && (
            <ProfileView
              agent={profileAgent}
              onBack={() => { setView('team'); setProfileId(null) }}
              onStatusChange={handleStatusChange}
              onRename={handleRename}
              activeTeam={team}
            />
          )}
          {view === 'hire' && (
            <HireView currentTeam={team} onHire={handleHire} activeTeam={team} />
          )}
          {view === 'folders' && (
            <FoldersView folders={folders} onConnect={handleConnectFolder} onDisconnect={handleDisconnectFolder} />
          )}
          {view === 'connections' && (
            <ConnectionsView onToast={addToast} />
          )}
          {view === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
                padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
              }}>
                <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Settings</h1>
              </div>
              <div className="scroll-region" style={{ flex: 1, padding: '24px' }}>
                <div style={{ maxWidth: 480, width: '100%' }}>

                  {/* Appearance section */}
                  <div style={{ marginBottom: 32 }}>
                    <div className="section-heading" style={{ marginTop: 0, marginBottom: 12, paddingLeft: 0 }}>Appearance</div>
                    <div style={{
                      border: '1px solid var(--border-subtle)', borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 10 }}>Theme</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {(['light', 'dark', 'system'] as ThemePreference[]).map(opt => {
                            const labels: Record<ThemePreference, string> = { light: 'Light', dark: 'Dark', system: 'System' }
                            const isActive = themePref === opt
                            return (
                              <button
                                key={opt}
                                onClick={() => setThemePref(opt)}
                                style={{
                                  flex: 1, height: 32, borderRadius: 6, border: '1px solid',
                                  borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-strong)',
                                  background: isActive ? 'var(--state-active)' : 'transparent',
                                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  transition: 'all 100ms ease',
                                }}
                              >
                                {labels[opt]}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI connection section */}
                  <div style={{ marginBottom: 32 }}>
                    <div className="section-heading" style={{ marginTop: 0, marginBottom: 12, paddingLeft: 0 }}>AI connection</div>
                    <div style={{
                      border: '1px solid var(--border-subtle)', borderRadius: 8,
                      padding: '14px 16px',
                    }}>
                      <AIConnectionSettings onToast={addToast} />
                    </div>
                  </div>

                  {/* Reset section */}
                  <div style={{ marginBottom: 32 }}>
                    <div className="section-heading" style={{ marginTop: 0, marginBottom: 12, paddingLeft: 0 }}>Demo data</div>
                    <div style={{
                      border: '1px solid var(--border-subtle)', borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>Reset names</div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                          Restores all team members to their original names. Custom names set during hire or from a profile will be cleared.
                        </p>
                        <button
                          className="btn-secondary"
                          style={{ height: 32 }}
                          onClick={handleResetNames}
                        >
                          Reset to defaults
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* About section */}
                  <div>
                    <div className="section-heading" style={{ marginTop: 0, marginBottom: 12, paddingLeft: 0 }}>About</div>
                    <div style={{
                      border: '1px solid var(--border-subtle)', borderRadius: 8,
                      padding: '14px 16px', fontSize: 13, color: 'var(--text-muted)',
                      background: 'var(--surface-sidebar)',
                    }}>
                      Your AI Staff, v5 desktop shell. Theme and name choices are persisted across sessions.
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(v) => navigate(v)}
        onViewProfile={(id) => { viewProfile(id); setPaletteOpen(false) }}
        onRunBrief={handleRunBrief}
        onToggleDarkMode={toggleDarkMode}
        team={team}
      />

      {/* Deploy your operating system */}
      <DeployWizard
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        team={team}
        onConnect={handleConnectFolder}
        onToast={addToast}
      />

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
