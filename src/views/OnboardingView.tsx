import { useState, useEffect } from 'react'
import { CheckCircle, Circle } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { INITIAL_TEAM } from '../data/team'
import { resolveNames, namesFromTeam } from '../names'
import type { Agent, OnboardingState } from '../data/types'

interface OnboardingViewProps {
  onboarding: OnboardingState
  onDismiss: () => void
  onGoTo: (view: 'home' | 'team' | 'folders' | 'hire' | 'settings' | 'vault') => void
  onOpenDeploy?: () => void
  team?: Agent[]
}

export function OnboardingView({ onboarding, onDismiss, onGoTo, onOpenDeploy, team = INITIAL_TEAM }: OnboardingViewProps) {
  const nameById = namesFromTeam(team)
  const r = (text: string) => resolveNames(text, nameById)
  const [modelConnected, setModelConnected] = useState(false)
  const [vaultConfigured, setVaultConfigured] = useState(false)

  useEffect(() => {
    window.electronAPI?.configStatus().then(s => setModelConnected(s.ready)).catch(() => {})
    window.electronAPI?.vaultStatus().then(s => setVaultConfigured(s.configured)).catch(() => {})
  }, [])

  const steps = [
    {
      id: 'deploy',
      done: vaultConfigured,
      title: 'Deploy your operating system',
      description: 'Set up the full operating system (pillars, agent workspace, roster, and ledger) in a folder you choose. Works on a fresh folder or alongside a vault you already have.',
      action: () => onOpenDeploy?.(),
      actionLabel: 'Deploy now',
    },
    {
      id: 'folder',
      done: onboarding.folderConnected,
      title: 'Connect a folder',
      description: 'Give your team access to the files they need. Your files stay in your own storage.',
      action: () => onGoTo('folders'),
      actionLabel: 'Connect a folder',
    },
    {
      id: 'team',
      done: onboarding.teamMet,
      title: 'Meet your team',
      description: r('{{orchestrator}} is your manager, with {{writer}} (writer), {{researcher}} (researcher), and {{reviewer}} (reviewer) ready to work.'),
      action: () => onGoTo('team'),
      actionLabel: 'Meet the team',
    },
    {
      id: 'model',
      done: modelConnected,
      title: 'Connect a model',
      description: r('Add an API key or a local endpoint so {{orchestrator}} and the team can run for real. Without one, briefs run in demo mode.'),
      action: () => onGoTo('settings'),
      actionLabel: 'Open Settings',
    },
    {
      id: 'brief',
      done: onboarding.firstBriefGiven,
      title: 'Give your first brief',
      description: r('Tell {{orchestrator}} what you need in plain English and watch your team handle it.'),
      action: () => onGoTo('home'),
      actionLabel: r('Brief {{orchestrator}}'),
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const allDone = completedCount === steps.length
  const orchestrator = team.find(a => a.isOrchestrator) ?? INITIAL_TEAM.find(a => a.isOrchestrator)!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
        background: 'var(--surface-header)', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Setup guide</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{completedCount} of {steps.length} done</span>
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>
        {/* Welcome pane */}
        <div style={{
          background: 'var(--surface-sidebar)', border: '1px solid var(--border-subtle)',
          borderRadius: 6, padding: '16px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <Avatar initials={orchestrator.avatarInitials} colour={orchestrator.avatarColour} size="md" showPresence presenceActive />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Hi, I am {orchestrator.name}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                I route work to the right specialist, narrate what is happening, and make sure nothing goes out without your approval.
                Let me walk you through getting started.
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div>
            <div style={{
              height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', background: 'var(--accent-primary)', borderRadius: 2,
                width: `${(completedCount / steps.length) * 100}%`,
                transition: 'width 700ms ease',
              }} />
            </div>
            {allDone && (
              <p style={{ fontSize: 12, color: 'var(--semantic-success)', marginTop: 6, marginBottom: 0, fontWeight: 500 }}>
                You are all set. Your team is ready to work.
              </p>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
          {steps.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                background: s.done ? '#f4fdf9' : 'transparent',
                borderColor: s.done ? '#b8e8cf' : 'var(--border-subtle)',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                {s.done
                  ? <CheckCircle size={16} style={{ color: 'var(--semantic-success)' }} />
                  : <Circle size={16} style={{ color: 'var(--border-strong)' }} />
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Step {idx + 1}
                  </span>
                  {s.done && <span style={{ fontSize: 11, color: 'var(--semantic-success)', fontWeight: 600 }}>Done</span>}
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: s.done ? '#1a7a4c' : 'var(--text-primary)', margin: '0 0 3px' }}>{s.title}</p>
                <p style={{ fontSize: 13, color: s.done ? '#2a9a60' : 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {s.description}
                </p>
                {!s.done && (
                  <button
                    style={{
                      marginTop: 8, fontSize: 12, color: 'var(--accent-primary)', fontWeight: 500,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                    }}
                    onClick={s.action}
                  >
                    {s.actionLabel} →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Starter team */}
        <p style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--text-muted)', marginBottom: 8, marginTop: 0,
        }}>Your starter team</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 20 }}>
          {team.map(agent => (
            <div key={agent.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
              borderRadius: 4,
            }}>
              <Avatar initials={agent.avatarInitials} colour={agent.avatarColour} size="sm" showPresence presenceActive />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 1px' }}>{agent.name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{agent.role}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
            color: 'var(--text-muted)', padding: '4px 0', fontFamily: 'inherit',
            display: 'block',
          }}
          onClick={onDismiss}
        >
          {allDone ? 'Dismiss and go to your team' : 'Skip setup for now'}
        </button>
      </div>
    </div>
  )
}
