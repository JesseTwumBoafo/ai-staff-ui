import { useState, useRef } from 'react'
import { ArrowLeft, Check, Folder } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { HIRING_LIBRARY } from '../data/hiring'
import type { Agent, HiringCandidate } from '../data/types'
import { validateName, NAME_MAX_LENGTH } from '../names'

interface HireViewProps {
  currentTeam: Agent[]
  onHire: (candidate: HiringCandidate, folders: string[], chosenName?: string) => void
  activeTeam: Agent[]
}

const AVAILABLE_FOLDERS = ['Projects', 'Clients', 'Notes']

type HireStep = 'browse' | 'review' | 'name' | 'done'

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

export function HireView({ currentTeam, onHire, activeTeam }: HireViewProps) {
  const [step, setStep] = useState<HireStep>('browse')
  const [selected, setSelected] = useState<HiringCandidate | null>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [chosenName, setChosenName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [customRole, setCustomRole] = useState(false)
  const [customAnswers, setCustomAnswers] = useState({ does: '', doesNot: '', folders: '' })
  const [customStep, setCustomStep] = useState(0)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const hiredIds = new Set(currentTeam.map(a => a.id))

  function startReview(candidate: HiringCandidate) {
    setSelected(candidate)
    setFolders(candidate.defaultFolders.filter(f => AVAILABLE_FOLDERS.includes(f)))
    setStep('review')
  }

  function toggleFolder(folder: string) {
    setFolders(prev => prev.includes(folder) ? prev.filter(f => f !== folder) : [...prev, folder])
  }

  // After folder step, move to naming step.
  function proceedToName() {
    if (!selected) return
    setChosenName(selected.name)
    setNameError(null)
    setStep('name')
    setTimeout(() => nameInputRef.current?.focus(), 10)
  }

  function confirmHire() {
    if (!selected) return
    // Validate the chosen name against the active team (excluding newly hired candidate).
    const err = validateName(chosenName, selected.id, activeTeam)
    if (err) { setNameError(err); return }
    onHire(selected, folders, chosenName.trim())
    setStep('done')
  }

  // Custom role flow
  if (customRole) {
    const questions = [
      { label: 'What should this specialist do?', key: 'does', placeholder: 'e.g. Draft client-facing reports from my project notes' },
      { label: 'What should they never do?', key: 'doesNot', placeholder: 'e.g. Never send anything externally, never access my Clients folder' },
      { label: 'Which folders should they access?', key: 'folders', placeholder: 'e.g. Projects (read and write), Notes (read only)' },
    ] as const

    const q = questions[customStep]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
          background: 'var(--surface-header)', gap: 12,
        }}>
          <button className="btn-secondary" onClick={() => { setCustomRole(false); setCustomStep(0) }}>
            <ArrowLeft size={12} /> Library
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Custom specialist</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{customStep + 1} of {questions.length}</span>
        </div>

        <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, marginTop: 0 }}>{q.label}</h2>
          <textarea
            style={{
              width: '100%', border: '1px solid var(--border-strong)', borderRadius: 6,
              padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)',
              fontFamily: 'inherit', lineHeight: 1.5, resize: 'none', outline: 'none',
              background: 'var(--surface-content)',
            }}
            rows={4}
            placeholder={q.placeholder}
            value={customAnswers[q.key]}
            onChange={e => setCustomAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {customStep > 0 && (
              <button className="btn-secondary" style={{ height: 32 }} onClick={() => setCustomStep(s => s - 1)}>Back</button>
            )}
            {customStep < questions.length - 1 ? (
              <button
                className="btn-primary"
                disabled={!customAnswers[q.key].trim()}
                onClick={() => setCustomStep(s => s + 1)}
              >
                Continue
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={!customAnswers[q.key].trim()}
                onClick={() => {
                  setCustomRole(false)
                  setCustomStep(0)
                  setCustomAnswers({ does: '', doesNot: '', folders: '' })
                  alert('Your custom specialist definition has been saved and is ready for review. In the full product, this would go through a validation step before going live.')
                }}
              >
                Save and validate
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Done state
  if (step === 'done' && selected) {
    const displayName = chosenName.trim() || selected.name
    const displayInitial = displayName.charAt(0).toUpperCase()
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
          background: 'var(--surface-header)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Add a specialist</span>
        </div>
        <div className="scroll-region" style={{ flex: 1, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Avatar initials={displayInitial} colour={selected.avatarColour} size="xl" showPresence presenceActive />
          <div style={{ marginTop: 16 }}>
            <div style={{
              width: 32, height: 32, background: '#e8f7ef', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              border: '1px solid #b8e8cf',
            }}>
              <Check size={15} style={{ color: 'var(--semantic-success)' }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{displayName} is on your team</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px', maxWidth: 320 }}>
              They can access {folders.join(' and ')}. Brief your manager and {displayName} will receive work through them.
            </p>
            <button className="btn-primary" onClick={() => { setStep('browse'); setSelected(null); setChosenName('') }}>
              Back to library
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Candidate review
  if (step === 'review' && selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
          background: 'var(--surface-header)', gap: 12,
        }}>
          <button className="btn-secondary" onClick={() => setStep('browse')}>
            <ArrowLeft size={12} /> Library
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{selected.name}</span>
        </div>

        <div className="scroll-region" style={{ flex: 1, padding: '20px 24px' }}>
          {/* Candidate header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
            <Avatar initials={selected.avatarInitials} colour={selected.avatarColour} size="lg" />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{selected.name}</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{selected.role}</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{selected.oneLiner}</p>
            </div>
          </div>

          <Divider />

          <SectionLabel>What {selected.name} does</SectionLabel>
          <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selected.whatIDo.map((item, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0, marginTop: 5 }} />
                {item}
              </li>
            ))}
          </ul>

          <SectionLabel>What {selected.name} will not do</SectionLabel>
          <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selected.whatIWillNotDo.map((item, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--semantic-error)', flexShrink: 0, marginTop: 5 }} />
                {item}
              </li>
            ))}
          </ul>

          <Divider />

          <SectionLabel>Folder access</SectionLabel>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, marginTop: 0 }}>
            Choose the minimum access {selected.name} needs. You can change this later.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
            {AVAILABLE_FOLDERS.map(folder => (
              <button
                key={folder}
                onClick={() => toggleFolder(folder)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 36,
                  border: folders.includes(folder) ? '1px solid var(--state-active)' : '1px solid var(--border-subtle)',
                  borderRadius: 4, background: folders.includes(folder) ? 'var(--state-hover)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  transition: 'background-color 50ms ease-in',
                }}
              >
                <Folder size={14} style={{ color: folders.includes(folder) ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: folders.includes(folder) ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{folder}</span>
                {folders.includes(folder) && (
                  <Check size={13} style={{ color: 'var(--accent-primary)' }} />
                )}
              </button>
            ))}
          </div>

          {folders.length > 0 && (
            <div style={{
              background: 'var(--surface-sidebar)', borderRadius: 4, padding: '8px 12px',
              marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              {selected.name} will be able to read your {folders.join(' and ')} {folders.length === 1 ? 'folder' : 'folders'} and cannot access anything else.
            </div>
          )}

          <button
            className="btn-primary"
            disabled={folders.length === 0}
            onClick={proceedToName}
            style={{ width: '100%', justifyContent: 'center', height: 32 }}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // Name step
  if (step === 'name' && selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
          background: 'var(--surface-header)', gap: 12,
        }}>
          <button className="btn-secondary" onClick={() => setStep('review')}>
            <ArrowLeft size={12} /> Back
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Give them a name</span>
        </div>

        <div className="scroll-region" style={{ flex: 1, padding: '32px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 32 }}>
            <Avatar
              initials={chosenName.trim().charAt(0).toUpperCase() || selected.avatarInitials}
              colour={selected.avatarColour}
              size="xl"
              showPresence
              presenceActive
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
              {selected.role}
            </p>
          </div>

          <div style={{ maxWidth: 320, margin: '0 auto' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
              Name
            </label>
            <input
              ref={nameInputRef}
              value={chosenName}
              onChange={e => { setChosenName(e.target.value); setNameError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') confirmHire() }}
              maxLength={NAME_MAX_LENGTH}
              placeholder={selected.name}
              style={{
                width: '100%', border: '1px solid var(--border-strong)', borderRadius: 6,
                padding: '8px 12px', fontSize: 14, color: 'var(--text-primary)',
                fontFamily: 'inherit', outline: 'none', background: 'var(--surface-content)',
                boxSizing: 'border-box',
                boxShadow: nameError ? '0 0 0 2px #fecaca' : undefined,
                borderColor: nameError ? 'var(--semantic-error)' : 'var(--border-strong)',
              }}
            />
            {nameError ? (
              <p style={{ fontSize: 12, color: 'var(--semantic-error)', margin: '4px 0 0', lineHeight: 1.4 }}>{nameError}</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                Up to {NAME_MAX_LENGTH} characters. This is what appears on the roster and in activity.
              </p>
            )}

            <button
              className="btn-primary"
              onClick={confirmHire}
              disabled={!chosenName.trim()}
              style={{ width: '100%', justifyContent: 'center', height: 36, marginTop: 16 }}
            >
              <Check size={13} /> Add to your team
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Browse view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 24px', borderBottom: '1px solid var(--border-strong)',
        background: 'var(--surface-header)',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Add a specialist</h1>
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '16px 24px' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0, lineHeight: 1.5 }}>
          Browse pre-built roles and add whoever fits your needs. Each specialist comes ready to work.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 16 }}>
          {HIRING_LIBRARY.map(candidate => {
            const alreadyHired = hiredIds.has(candidate.id)
            return (
              <button
                key={candidate.id}
                onClick={() => !alreadyHired && startReview(candidate)}
                disabled={alreadyHired}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 48,
                  border: 'none', borderRadius: 4, cursor: alreadyHired ? 'default' : 'pointer',
                  background: 'transparent', textAlign: 'left', fontFamily: 'inherit',
                  opacity: alreadyHired ? 0.5 : 1,
                  transition: 'background-color 50ms ease-in',
                }}
                onMouseEnter={e => { if (!alreadyHired) (e.currentTarget as HTMLElement).style.background = 'var(--state-hover)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Avatar initials={candidate.avatarInitials} colour={candidate.avatarColour} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{candidate.name}</span>
                    {alreadyHired && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--semantic-success)',
                        background: '#e8f7ef', borderRadius: 4, padding: '0 5px',
                      }}>On team</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {candidate.oneLiner}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Custom role CTA */}
        <div style={{
          border: '1px dashed var(--border-strong)', borderRadius: 6, padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Need something different?</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Define a custom specialist by answering a few questions.
          </p>
          <button
            className="btn-secondary"
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
            onClick={() => setCustomRole(true)}
          >
            Build a custom specialist
          </button>
        </div>
      </div>
    </div>
  )
}
