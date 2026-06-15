import { useState, useEffect } from 'react'
import { ArrowDownRight, Plus, UserPlus } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { StatusBadge } from '../components/StatusBadge'
import type { Agent } from '../data/types'
import type { ConfigStatus } from '../electron'

interface TeamViewProps {
  team: Agent[]
  onViewProfile: (agentId: string) => void
  selectedAgentId?: string | null
  liveAgents?: Set<string>
  onHire?: () => void
}

// Functional areas of the operating model. Each is a work stream beneath the
// manager; agents map in by their lane.
const FUNCTIONAL_AREAS: { id: string; label: string; lanes: string[]; core: boolean }[] = [
  { id: 'delivery', label: 'Delivery', lanes: ['writing'], core: true },
  { id: 'insight', label: 'Insight', lanes: ['research'], core: true },
  { id: 'assurance', label: 'Assurance', lanes: ['review'], core: true },
  { id: 'talent', label: 'Talent', lanes: ['hiring'], core: false },
]

const SHORT_MODELS: Record<string, string> = {
  'claude-opus-4-8': 'Opus 4.8', 'claude-opus-4-7': 'Opus 4.7', 'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6', 'claude-haiku-4-5': 'Haiku 4.5', 'claude-fable-5': 'Fable 5',
}
function shortModel(m: string) { return SHORT_MODELS[m] || m }

const COL_WIDTH = 220
const COL_GAP = 28
const electronAPI = window.electronAPI

export function TeamView({ team, onViewProfile, selectedAgentId, liveAgents, onHire }: TeamViewProps) {
  const [roleModels, setRoleModels] = useState<ConfigStatus['roleModels']>({})

  useEffect(() => {
    if (!electronAPI) return
    electronAPI.configStatus().then(s => setRoleModels(s.roleModels)).catch(() => {})
  }, [team.length])

  const isLive = (id: string) => !!liveAgents && liveAgents.has(id)

  const orchestrator = team.find(a => a.isOrchestrator)
  const specialists = team.filter(a => !a.isOrchestrator)

  const areas = FUNCTIONAL_AREAS.map(a => ({ ...a, agents: specialists.filter(s => a.lanes.includes(s.lane)) }))
  const claimed = new Set(areas.flatMap(a => a.agents.map(x => x.id)))
  const others = specialists.filter(s => !claimed.has(s.id))
  if (others.length) areas.push({ id: 'other', label: 'Other', lanes: [], core: false, agents: others })

  const activeCount = team.filter(a => a.status === 'active').length
  const pausedCount = team.filter(a => a.status === 'paused').length
  const gaps = areas.filter(a => a.core && !a.agents.some(x => x.status === 'active'))

  function modelBadge(agentId: string) {
    const rm = roleModels[agentId]
    if (!rm || !rm.model) return null
    return (
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-primary)', background: 'var(--state-active)', borderRadius: 4, padding: '1px 6px' }}>{shortModel(rm.model)}</span>
    )
  }

  function agentCard(agent: Agent, full?: boolean) {
    const live = isLive(agent.id)
    const selected = selectedAgentId === agent.id
    return (
      <button
        key={agent.id}
        onClick={() => onViewProfile(agent.id)}
        className="content-card"
        style={{
          width: full ? 220 : '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
          border: `1px solid ${selected ? 'var(--accent-primary)' : live ? 'var(--semantic-success)' : 'var(--border-subtle)'}`,
          boxShadow: live ? '0 0 0 3px #e8f7ef' : 'none',
          transition: 'box-shadow 150ms ease, border-color 150ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar initials={agent.avatarInitials} colour={agent.avatarColour} size="sm" showPresence presenceActive={agent.status === 'active'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.role}</div>
          </div>
          {live ? <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--semantic-success)' }}>working</span> : <StatusBadge status={agent.status} />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {modelBadge(agent.id)}
          {agent.lane === 'review' && <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}><ArrowDownRight size={10} /> reviews drafts</span>}
          {agent.lane === 'writing' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>sends to review</span>}
        </div>
        {agent.folderAccess.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {agent.folderAccess.slice(0, 3).map(f => (
              <span key={f.name} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-sidebar)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '0 5px' }}>{f.name}</span>
            ))}
          </div>
        )}
      </button>
    )
  }

  const anyLive = areas.some(a => a.agents.some(x => isLive(x.id)))
  const busColour = anyLive ? 'var(--semantic-success)' : 'var(--border-strong)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 24px', borderBottom: '1px solid var(--border-strong)', background: 'var(--surface-header)',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Operating model</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeCount} active{pausedCount ? ` · ${pausedCount} paused` : ''}</span>
        <div style={{ flex: 1 }} />
        {gaps.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--semantic-warning)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {gaps.map(a => <span key={a.id} style={{ background: '#fff7e6', border: '1px solid #f7d8a0', borderRadius: 4, padding: '1px 6px' }}>{a.label}: no active agent</span>)}
          </span>
        )}
      </div>

      <div className="scroll-region" style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.5, textAlign: 'center', maxWidth: 620 }}>
          {orchestrator ? orchestrator.name : 'The orchestrator'} sits across the team and delegates each brief down to the work streams. The reviewer checks the writers' output before it reaches you. Streams light up as they work.
        </p>

        {/* Manager, centred */}
        {orchestrator && <div style={{ width: 240 }}>{agentCard(orchestrator)}</div>}

        {/* Connector from manager down to the bus */}
        <div style={{ width: 2, height: 18, background: orchestrator && isLive(orchestrator.id) ? 'var(--semantic-success)' : 'var(--border-strong)' }} />

        {/* Bus + functional-area columns */}
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <div style={{ position: 'relative', display: 'inline-flex', gap: COL_GAP, alignItems: 'flex-start' }}>
            <div style={{ position: 'absolute', top: 0, left: COL_WIDTH / 2, right: COL_WIDTH / 2, height: 2, background: busColour }} />
            {areas.map(area => {
              const areaLive = area.agents.some(x => isLive(x.id))
              const dropColour = areaLive ? 'var(--semantic-success)' : 'var(--border-strong)'
              const isGap = area.core && !area.agents.some(x => x.status === 'active')
              return (
                <div key={area.id} style={{ width: COL_WIDTH, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 2, height: 16, background: dropColour }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: areaLive ? 'var(--semantic-success)' : 'var(--text-secondary)' }}>{area.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{area.agents.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                    {area.agents.map(a => agentCard(a))}
                    {area.agents.length === 0 && (
                      <div style={{
                        border: `1px dashed ${isGap ? '#f7d8a0' : 'var(--border-strong)'}`, borderRadius: 8,
                        padding: '14px 12px', textAlign: 'center', fontSize: 12,
                        color: isGap ? 'var(--semantic-warning)' : 'var(--text-muted)',
                        background: isGap ? '#fff7e6' : 'transparent',
                      }}>
                        No one here yet
                      </div>
                    )}
                    {area.id === 'talent' && onHire && (
                      <button
                        onClick={onHire}
                        style={{
                          width: '100%', height: 56, border: '1px dashed var(--border-strong)', borderRadius: 8,
                          background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          color: 'var(--accent-primary)', fontSize: 13, fontWeight: 500,
                        }}
                      >
                        <span style={{ position: 'relative', display: 'flex' }}><UserPlus size={16} /><Plus size={9} style={{ position: 'absolute', right: -4, top: -3 }} /></span>
                        Add a specialist
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
