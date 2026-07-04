import { useState, useEffect } from 'react'

// Detect the Electron preload API (typed globally in src/electron.d.ts)
const electronAPI = window.electronAPI

const isElectron = Boolean(electronAPI)
// On macOS the window keeps its native traffic lights (inset via hiddenInset in
// main.cjs), so we hide the Windows-style controls and leave the rail clear for
// the OS-drawn buttons.
const isMac = isElectron && electronAPI?.platform === 'darwin'

interface TitleBarProps {
  currentView: string
}

export function TitleBar({ currentView }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState<'min' | 'max' | 'close' | null>(null)

  useEffect(() => {
    if (!electronAPI) return
    electronAPI.isMaximized().then(setMaximized)
    const unsub = electronAPI.onMaximizeChange(setMaximized)
    return unsub
  }, [])

  const viewLabels: Record<string, string> = {
    home: 'Activity',
    team: 'Team',
    vault: 'Operating System',
    profile: 'Team',
    folders: 'Folders',
    onboarding: 'Setup guide',
    hire: 'Add a specialist',
    settings: 'Settings',
  }

  const label = viewLabels[currentView] ?? 'Your AI Staff'

  return (
    <div
      style={{
        height: 32,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        background: 'transparent',
        position: 'relative',
        zIndex: 30,
        // Enable drag for the whole bar; interactive elements opt out below
        WebkitAppRegion: isElectron ? 'drag' : 'no-drag',
      } as React.CSSProperties}
    >
      {/* Rail portion */}
      <div style={{
        width: 56,
        height: 32,
        background: 'var(--surface-rail)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}>
        {isElectron ? (
          /* Electron: no macOS-style dots; Windows controls are right-aligned */
          null
        ) : (
          /* Browser: decorative macOS-style dots */
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', display: 'block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'block' }} />
          </div>
        )}
      </div>

      {/* Header portion */}
      <div style={{
        flex: 1,
        height: 32,
        background: 'var(--surface-header)',
        borderBottom: '1px solid var(--border-strong)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 16,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
          your AI staff
        </span>
        {isElectron && (
          <span style={{
            marginLeft: 8, fontSize: 11, color: 'var(--text-muted)',
          }}>
            / {label}
          </span>
        )}
        {!isElectron && (
          <span style={{
            marginLeft: 12, fontSize: 11, color: 'var(--text-muted)',
            background: 'var(--surface-sidebar)', border: '1px solid var(--border-subtle)',
            borderRadius: 4, padding: '1px 6px',
          }}>
            {navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'}
          </span>
        )}
      </div>

      {/* Electron on Windows/Linux only: custom window controls (right side).
          macOS uses the native traffic lights, so these are hidden there. */}
      {isElectron && !isMac && (
        <div style={{
          display: 'flex',
          height: 32,
          background: 'var(--surface-header)',
          borderBottom: '1px solid var(--border-strong)',
          WebkitAppRegion: 'no-drag',
          flexShrink: 0,
        } as React.CSSProperties}>
          {/* Minimise */}
          <WinCtrlBtn
            label="Minimise"
            hovered={hovered === 'min'}
            onEnter={() => setHovered('min')}
            onLeave={() => setHovered(null)}
            onClick={() => electronAPI?.minimize()}
            dangerHover={false}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </WinCtrlBtn>

          {/* Maximise / restore */}
          <WinCtrlBtn
            label={maximized ? 'Restore' : 'Maximise'}
            hovered={hovered === 'max'}
            onEnter={() => setHovered('max')}
            onLeave={() => setHovered(null)}
            onClick={() => electronAPI?.toggleMaximize()}
            dangerHover={false}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="2" y="0" width="8" height="8" stroke="currentColor" strokeWidth="1" />
                <rect x="0" y="2" width="8" height="8" fill="var(--surface-header)" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </WinCtrlBtn>

          {/* Close */}
          <WinCtrlBtn
            label="Close"
            hovered={hovered === 'close'}
            onEnter={() => setHovered('close')}
            onLeave={() => setHovered(null)}
            onClick={() => electronAPI?.close()}
            dangerHover={true}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </WinCtrlBtn>
        </div>
      )}
    </div>
  )
}

interface WinCtrlBtnProps {
  label: string
  hovered: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
  dangerHover: boolean
  children: React.ReactNode
}

function WinCtrlBtn({ label, hovered, onEnter, onLeave, onClick, dangerHover, children }: WinCtrlBtnProps) {
  return (
    <button
      aria-label={label}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{
        width: 46,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? (dangerHover ? '#E34935' : 'var(--state-hover)') : 'transparent',
        color: hovered && dangerHover ? '#fff' : 'var(--text-muted)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 80ms ease',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}
