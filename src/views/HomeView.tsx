import { useState, useEffect, useRef } from 'react'
import { Send, RotateCcw, Eye, EyeOff, Square, ChevronRight, ChevronDown } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ReviewGateCard } from '../components/ReviewGateCard'
import { CANNED_BRIEFS, GENERIC_FLOW } from '../data/flows'
import { INITIAL_TEAM } from '../data/team'
import { estimateCost } from '../data/models'
import { resolveNames } from '../names'
import type { FeedStep, FolderAccess, OnboardingState } from '../data/types'
import type { AgentEvent, AgentDraft, AgentSummary, TokenUsage, TranscriptEntry } from '../electron'
import { saveRun, getRuns } from '../runs'

const electronAPI = window.electronAPI

// Map a streamed agent event to a feed step, with a role-appropriate label.
function agentEventToStep(ev: AgentEvent): FeedStep {
  let type: FeedStep['type'] = 'routing'
  if (ev.type === 'tool') type = 'read'
  else if (ev.type === 'text') {
    type = ev.agentId === 'writer' ? 'write' : ev.agentId === 'researcher' ? 'read' : 'routing'
  }
  return {
    id: makeId(),
    timestamp: Date.now(),
    agentId: ev.agentId,
    agentName: '',
    text: ev.text,
    type,
    level: ev.level,
    subId: ev.subId,
  }
}

interface HomeViewProps {
  onboarding: OnboardingState
  onFirstBriefGiven: () => void
  initialFlowId?: string | null
  onClearInitialFlow?: () => void
  teamNames?: Record<string, string>
  folders?: FolderAccess[]
  agents?: AgentSummary[]
  openRunId?: string | null
  onClearOpenRun?: () => void
  onRunSaved?: () => void
}

let stepCounter = 0
function makeId() { return `step-${++stepCounter}` }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

// Real deliverable written into a connected read-write folder on approval.
function buildOutputContent(briefText: string, names: Record<string, string>): string {
  const orchestrator = names['orchestrator'] ?? 'Your AI staff'
  const writer = names['writer'] ?? 'the writer'
  const reviewer = names['reviewer'] ?? 'the reviewer'
  return [
    `# ${briefText || 'AI staff output'}`,
    '',
    `Routed by ${orchestrator}. Drafted by ${writer}. Reviewed by ${reviewer}.`,
    '',
    'This file was written to your connected folder by Your AI Staff, demonstrating real write access.',
    '',
    '## Brief',
    briefText || '(no brief text)',
    '',
    '## Notes',
    '- Draft produced from the documents in your connected folder.',
    '- Replace this content with the real deliverable once the pipeline is wired to your models.',
    '',
  ].join('\n')
}

const stepTypeConfig: Record<string, { label: string; colour: string }> = {
  routing: { label: 'routing', colour: 'var(--text-muted)' },
  read: { label: 'reading', colour: 'var(--semantic-info)' },
  write: { label: 'writing', colour: 'var(--semantic-success)' },
  'review-gate': { label: 'awaiting approval', colour: 'var(--accent-primary)' },
  complete: { label: 'done', colour: 'var(--semantic-success)' },
  undo: { label: 'undone', colour: 'var(--semantic-warning)' },
}

export function HomeView({ onboarding, onFirstBriefGiven, initialFlowId, onClearInitialFlow, teamNames = {}, folders = [], agents = [], openRunId, onClearOpenRun, onRunSaved }: HomeViewProps) {
  const [brief, setBrief] = useState('')
  const [running, setRunning] = useState(false)
  const [feed, setFeed] = useState<FeedStep[]>([])
  const [reviewGateVisible, setReviewGateVisible] = useState(false)
  const [reviewGateData, setReviewGateData] = useState<{
    title: string; summary: string; proposedAction: string; recommendation: string; recommendationLabel: string
  } | null>(null)
  const [pendingSteps, setPendingSteps] = useState<Omit<FeedStep, 'id' | 'timestamp'>[]>([])
  const [pendingDraft, setPendingDraft] = useState<AgentDraft | null>(null)
  const [agentReady, setAgentReady] = useState(false)
  const [showSubAgents, setShowSubAgents] = useState(true)
  const [stoppable, setStoppable] = useState(false)
  const [runUsage, setRunUsage] = useState<TokenUsage | null>(null)
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptEntry[]>>({})
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set())
  const [resumeContext, setResumeContext] = useState<{ brief: string; deliverable: string } | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const prevRunningRef = useRef(false)
  const lastDeliverableRef = useRef<string>('')
  const runStartRef = useRef<number>(0)

  function handleStop() {
    electronAPI?.stopAgent()
  }

  // Route streamed events: sub-agent transcripts go to a side map, the rest to the feed.
  function handleAgentEvent(ev: AgentEvent) {
    if (ev.type === 'transcript' && ev.subId) {
      const id = ev.subId
      setTranscripts(prev => ({ ...prev, [id]: ev.transcript ?? [] }))
      return
    }
    setFeed(prev => [...prev, agentEventToStep(ev)])
  }

  function toggleTranscript(subId: string) {
    setExpandedTranscripts(prev => {
      const next = new Set(prev)
      if (next.has(subId)) next.delete(subId); else next.add(subId)
      return next
    })
  }

  // Persist a run once it finishes (last step is the completion line).
  useEffect(() => {
    if (prevRunningRef.current && !running && feed.length > 0) {
      const last = feed[feed.length - 1]
      if (last && last.type === 'complete') {
        saveRun({ title: brief || feed[0]?.text || 'Run', steps: feed, brief, deliverable: lastDeliverableRef.current })
        onRunSaved?.()
      }
    }
    prevRunningRef.current = running
  }, [running])

  // Load a saved run's transcript when asked (read-only).
  useEffect(() => {
    if (!openRunId) return
    const run = getRuns().find(r => r.id === openRunId)
    if (run) {
      setRunning(false)
      setReviewGateVisible(false)
      setPendingDraft(null)
      setBrief('')
      setFeed(run.steps)
      setResumeContext(run.brief && run.deliverable ? { brief: run.brief, deliverable: run.deliverable } : null)
    }
    onClearOpenRun?.()
  }, [openRunId])

  // Is a real model connected? Determines real-agent vs scripted-demo runs.
  useEffect(() => {
    if (electronAPI) {
      electronAPI.configStatus().then(s => setAgentReady(s.ready)).catch(() => {})
    }
  }, [])

  // Live agent names, for resolving {{agentId}} tokens in scripted copy.
  const agentMap = Object.fromEntries(
    INITIAL_TEAM.map(a => {
      const liveName = teamNames[a.id]
      return [a.id, liveName ? { ...a, name: liveName, avatarInitials: liveName.charAt(0).toUpperCase() } : a]
    })
  )
  const nameById = Object.fromEntries(Object.values(agentMap).map(a => [a.id, a.name]))

  // Connected folders this run can actually read from / write to.
  const connectedFolders = folders.filter(f => f.connected)
  const readFolder = connectedFolders.find(f => f.path) ?? connectedFolders[0]
  const writeFolder = connectedFolders.find(f => f.path && f.permission === 'read-write')

  // For a 'read' step, list the real folder and append what was found.
  async function augmentStep(step: Omit<FeedStep, 'id' | 'timestamp'>): Promise<Omit<FeedStep, 'id' | 'timestamp'>> {
    if (step.type !== 'read' || !readFolder?.path || !electronAPI) return step
    const res = await electronAPI.listFolder(readFolder.path)
    if (res.ok && res.entries) {
      const names = res.entries.filter(e => !e.isDirectory).map(e => e.name)
      if (!names.length) return { ...step, text: `${step.text} ${readFolder.name} is connected but empty.` }
      const preview = names.slice(0, 6).join(', ')
      const more = names.length > 6 ? ', …' : ''
      return { ...step, text: `${step.text} Found ${names.length} file${names.length === 1 ? '' : 's'} in ${readFolder.name}: ${preview}${more}.` }
    }
    return { ...step, text: `${step.text} (Could not read ${readFolder.name}: ${res.error ?? 'unknown error'}.)` }
  }

  // On approval, write the deliverable into a connected read-write folder.
  // Returns the text for the closing 'Done' step.
  async function writeOutput(): Promise<string> {
    if (!writeFolder?.path || !electronAPI) {
      return writeFolder
        ? 'Done. Everything has been saved as agreed.'
        : 'Done. The draft is ready. Connect a folder with read and write access to save it to disk automatically.'
    }
    const fileName = `${slugify(brief) || 'ai-staff-output'}.md`
    const res = await electronAPI.writeFile(writeFolder.path, fileName, buildOutputContent(brief, nameById))
    if (res.ok && res.path) {
      return `Done. Saved ${fileName} to your ${writeFolder.name} folder (${res.path}).`
    }
    return `Done, but I could not write to ${writeFolder.name}: ${res.error ?? 'unknown error'}.`
  }

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [feed, reviewGateVisible])

  useEffect(() => {
    if (initialFlowId) {
      handleCanned(initialFlowId)
      onClearInitialFlow?.()
    }
  }, [initialFlowId])

  function runFlow(steps: Omit<FeedStep, 'id' | 'timestamp'>[], hasGate: boolean, gateIndex: number) {
    setRunning(true)
    setFeed([])
    setReviewGateVisible(false)
    setReviewGateData(null)

    const preGate = hasGate ? steps.slice(0, gateIndex) : steps
    const postGate = hasGate ? steps.slice(gateIndex) : []

    let i = 0
    function addNext() {
      if (i >= preGate.length) {
        if (hasGate) {
          const gateStep = postGate[0]
          setPendingSteps(postGate.slice(1))
          setFeed(prev => [...prev, { ...gateStep, id: makeId(), timestamp: Date.now() }])
          setReviewGateVisible(true)
          setReviewGateData({
            title: 'Ready for your approval',
            summary: 'The draft has been written and reviewed. Here is what will happen next.',
            proposedAction: writeFolder
              ? `Save the final document to your ${writeFolder.name} folder.`
              : 'Save the final document. Connect a folder with read and write access to write it to disk.',
            recommendation: writeFolder ? `Approve and save to ${writeFolder.name}.` : 'Approve and save.',
            recommendationLabel: 'Approve and save',
          })
        }
        return
      }
      const step = preGate[i++]
      const delay = step.type === 'routing' ? 1200 : step.type === 'read' ? 1800 : 2200
      augmentStep(step).then(resolved => {
        setFeed(prev => [...prev, { ...resolved, id: makeId(), timestamp: Date.now() }])
        setTimeout(addNext, delay)
      })
    }
    addNext()
  }

  // Route a brief to the real agent (when a model is connected) or the
  // scripted demo flow otherwise.
  function startBrief(briefText: string) {
    if (agentReady && electronAPI) {
      const effective = resumeContext
        ? `This continues an earlier conversation.\nEarlier brief: ${resumeContext.brief}\n\nDeliverable produced earlier:\n${resumeContext.deliverable}\n\nFollow-up request: ${briefText}`
        : briefText
      setResumeContext(null)
      runRealFlow(effective)
      return
    }
    const match = CANNED_BRIEFS.find(f => f.briefText.toLowerCase() === briefText.toLowerCase())
    if (match) {
      runFlow(match.steps, !!match.hasReviewGate, match.reviewGateIndex ?? match.steps.length)
    } else {
      runFlow(GENERIC_FLOW, true, 6)
    }
  }

  // Real run: writer reads the connected folders and produces a draft; the
  // review gate then offers to run a review pass and save the file.
  async function runRealFlow(briefText: string) {
    if (!electronAPI) return
    runStartRef.current = Date.now()
    setRunning(true)
    setStoppable(true)
    setFeed([])
    setReviewGateVisible(false)
    setReviewGateData(null)
    setPendingDraft(null)
    setPendingSteps([])
    setTranscripts({})
    setExpandedTranscripts(new Set())

    const unsub = electronAPI.onAgentEvent(handleAgentEvent)
    const res = await electronAPI.runOrchestrator(briefText, connectedFolders, agents)
    unsub()
    setRunUsage(res.usage ?? null)

    if (res.aborted) {
      setFeed(prev => [...prev, {
        id: makeId(), timestamp: Date.now(),
        agentId: 'orchestrator', agentName: '', text: 'Run stopped.', type: 'routing',
      }])
      setRunning(false)
      setStoppable(false)
      return
    }

    if (!res.ok || !res.draft) {
      setFeed(prev => [...prev, {
        id: makeId(), timestamp: Date.now(),
        agentId: 'orchestrator', agentName: '',
        text: res.error ?? 'The run did not complete.', type: 'routing',
      }])
      setRunning(false)
      setStoppable(false)
      return
    }

    setStoppable(false)
    setPendingDraft(res.draft)
    setReviewGateVisible(true)
    setReviewGateData({
      title: 'Ready for your approval',
      summary: 'The draft is ready. Approving runs a review pass and saves the file.',
      proposedAction: writeFolder
        ? `Save ${res.draft.filename} to your ${writeFolder.name} folder.`
        : `Produce ${res.draft.filename}. Connect a folder with read and write access to save it to disk.`,
      recommendation: writeFolder ? `Approve, review, and save to ${writeFolder.name}.` : 'Approve and review.',
      recommendationLabel: 'Approve and save',
    })
  }

  function handleSubmit() {
    if (!brief.trim() || running) return
    if (!onboarding.firstBriefGiven) onFirstBriefGiven()
    startBrief(brief.trim())
  }

  function handleCanned(flowId: string) {
    const flow = CANNED_BRIEFS.find(f => f.id === flowId)
    if (!flow) return
    setBrief(flow.briefText)
    if (!onboarding.firstBriefGiven) onFirstBriefGiven()
    startBrief(flow.briefText)
  }

  // Real approval: review pass (second model call) then write the file.
  async function realApprove() {
    if (!electronAPI || !pendingDraft) return
    const draft = pendingDraft
    setReviewGateVisible(false)
    setReviewGateData(null)
    setStoppable(true)
    const unsub = electronAPI.onAgentEvent(handleAgentEvent)
    const res = await electronAPI.reviewAndWrite(brief, draft, connectedFolders)
    unsub()
    lastDeliverableRef.current = res.finalContent ?? draft.content
    setPendingDraft(null)
    setRunning(false)
    setStoppable(false)
    if (res.aborted) {
      setFeed(prev => [...prev, {
        id: makeId(), timestamp: Date.now(),
        agentId: 'orchestrator', agentName: '', text: 'Run stopped before saving. Nothing was written.', type: 'routing',
      }])
      return
    }
    const totalIn = (runUsage?.input ?? 0) + (res.usage?.input ?? 0)
    const totalOut = (runUsage?.output ?? 0) + (res.usage?.output ?? 0)
    const mergedModels: Record<string, { provider: 'anthropic' | 'openai' | 'gemini' | 'local'; input: number; output: number }> = {}
    for (const src of [runUsage?.models, res.usage?.models]) {
      if (!src) continue
      for (const [id, u] of Object.entries(src)) {
        const m = mergedModels[id] || (mergedModels[id] = { provider: u.provider, input: 0, output: 0 })
        m.input += u.input; m.output += u.output
      }
    }
    const { cost, priced } = estimateCost(mergedModels)
    const costNote = priced ? `, ~$${cost.toFixed(cost < 1 ? 4 : 2)}` : ''
    const usageNote = (totalIn || totalOut)
      ? ` (${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out tokens${costNote})`
      : ''
    setRunUsage(null)
    const doneText = res.ok
      ? (res.written
          ? `Done. Saved ${res.written.name} to your ${res.written.folder} folder (${res.written.path}).${usageNote}`
          : `Done. The deliverable is ready. Connect a folder with read and write access to save it to disk automatically.${usageNote}`)
      : `Done, but the write failed: ${res.error ?? 'unknown error'}.`
    setFeed(prev => [...prev, {
      id: makeId(), timestamp: Date.now(),
      agentId: 'orchestrator', agentName: '',
      text: doneText, type: 'complete',
    }])
    // Notify on a long run that finished while the window is in the background.
    const elapsed = Date.now() - runStartRef.current
    if (elapsed > 20000 && typeof document !== 'undefined' && !document.hasFocus()) {
      electronAPI.notify('Your AI Staff', doneText)
    }
  }

  function handleApprove() {
    if (pendingDraft) { realApprove(); return }
    setReviewGateVisible(false)
    setReviewGateData(null)
    let i = 0
    const remaining = pendingSteps
    function addNext() {
      if (i >= remaining.length) {
        writeOutput().then(doneText => {
          setRunning(false)
          setFeed(prev => [...prev, {
            id: makeId(), timestamp: Date.now(),
            agentId: 'orchestrator', agentName: 'Nadia',
            text: doneText,
            type: 'complete',
          }])
        })
        return
      }
      const step = remaining[i++]
      setFeed(prev => [...prev, { ...step, id: makeId(), timestamp: Date.now() }])
      setTimeout(addNext, 1400)
    }
    addNext()
  }

  function handleEditFirst() {
    setReviewGateVisible(false)
    setReviewGateData(null)
    setPendingDraft(null)
    setRunning(false)
    setFeed(prev => [...prev, {
      id: makeId(), timestamp: Date.now(),
      agentId: 'orchestrator', agentName: 'Nadia',
      text: 'No problem. I\'ve paused here. Update your brief below and I\'ll re-run from the start.',
      type: 'routing',
    }])
  }

  function handleUndo(stepId: string) {
    setFeed(prev => prev.map(s => s.id === stepId ? { ...s, undone: true } : s))
  }

  // Per-conversation sub-agent visibility.
  const hasSubAgentSteps = feed.some(s => s.level === 'subagent')
  const visibleFeed = showSubAgents ? feed : feed.filter(s => s.level !== 'subagent')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Brief input box */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {resumeContext && (
          <div style={{
            marginBottom: 10, padding: '8px 12px', borderRadius: 6,
            background: 'var(--state-active)', border: '1px solid var(--accent-primary)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
              Continuing a saved run. Your next brief will build on the earlier deliverable.
            </span>
            <button className="btn-secondary" style={{ height: 26 }} onClick={() => setResumeContext(null)}>Start fresh</button>
          </div>
        )}
        <div className="content-card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Avatar
              initials={(teamNames['orchestrator'] ?? 'Nadia').charAt(0).toUpperCase()}
              colour="#4f46e5"
              showPresence
              presenceActive={running}
              size="sm"
            />
            <div style={{ flex: 1 }}>
              <textarea
                style={{
                  width: '100%', border: 'none', resize: 'none',
                  color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5,
                  background: 'transparent', outline: 'none',
                  fontFamily: 'inherit',
                }}
                rows={2}
                placeholder="What do you need today?"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                disabled={running}
              />
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Press Enter to send</span>
            {running && stoppable ? (
              <button
                className="btn-secondary"
                onClick={handleStop}
                style={{ color: 'var(--semantic-error)', borderColor: '#f5c0bb' }}
              >
                <Square size={11} />
                Stop
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!brief.trim() || running}
              >
                <Send size={12} />
                Brief {teamNames['orchestrator'] ?? 'Nadia'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feed area */}
      <div ref={feedRef} className="scroll-region" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Canned briefs when idle */}
        {!running && feed.length === 0 && (
          <div style={{ padding: '16px 24px' }}>
            <div className="feed-date-sep">Suggested briefs</div>
            {CANNED_BRIEFS.map(flow => (
              <button
                key={flow.id}
                onClick={() => handleCanned(flow.id)}
                className="sidebar-row"
                style={{
                  width: '100%', padding: '0 12px', height: 36,
                  borderRadius: 4, border: 'none', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{flow.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>run</span>
              </button>
            ))}
          </div>
        )}

        {/* Feed */}
        {feed.length > 0 && (
          <div style={{ padding: '8px 0' }}>
            <div className="feed-date-sep">Today</div>

            {/* Feed controls: sub-agent visibility (per conversation) + clear */}
            {(hasSubAgentSteps || !running) && (
              <div style={{ padding: '0 24px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {hasSubAgentSteps ? (
                  <button
                    onClick={() => setShowSubAgents(v => !v)}
                    className="btn-secondary"
                    title="Show or hide what the specialists did"
                  >
                    {showSubAgents ? <Eye size={11} /> : <EyeOff size={11} />}
                    {showSubAgents ? 'Hide sub-agents' : 'Show sub-agents'}
                  </button>
                ) : <span />}
                {!running && (
                  <button
                    className="btn-secondary"
                    onClick={() => { setFeed([]); setBrief(''); setRunning(false); setReviewGateVisible(false); setPendingDraft(null) }}
                  >
                    <RotateCcw size={11} /> Clear
                  </button>
                )}
              </div>
            )}

            {visibleFeed.map((step, idx) => {
              const agent = agentMap[step.agentId]
              const config = stepTypeConfig[step.type] || stepTypeConfig.routing
              const isLast = idx === visibleFeed.length - 1
              // Use live name (from teamNames) for NEW feed entries; past entries keep their captured name.
              const displayAgentName = (teamNames[step.agentId] ?? step.agentName)

              return (
                <div
                  key={step.id}
                  className="feed-step-enter"
                  style={{
                    display: 'flex', gap: 10, padding: '8px 24px',
                    opacity: step.undone ? 0.4 : 1,
                  }}
                >
                  {/* Avatar */}
                  <div style={{ flexShrink: 0 }}>
                    {agent && (
                      <Avatar
                        initials={agent.avatarInitials}
                        colour={agent.avatarColour}
                        size="sm"
                        showPresence={running && isLast && !reviewGateVisible}
                        presenceActive
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{displayAgentName}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: config.colour }}>
                        {config.label}
                      </span>
                    </div>
                    <p style={{
                      fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0,
                      textDecoration: step.undone ? 'line-through' : 'none',
                    }}>
                      {resolveNames(step.text, nameById)}
                    </p>
                    {!step.undone && step.type !== 'complete' && step.type !== 'review-gate' && (
                      <button
                        onClick={() => handleUndo(step.id)}
                        style={{
                          marginTop: 4, fontSize: 11, color: 'var(--text-muted)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                          fontFamily: 'inherit',
                        }}
                      >
                        <RotateCcw size={10} /> Undo this step
                      </button>
                    )}
                    {step.subId && transcripts[step.subId] && transcripts[step.subId].length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <button
                          onClick={() => toggleTranscript(step.subId!)}
                          style={{
                            fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: 'inherit',
                          }}
                        >
                          {expandedTranscripts.has(step.subId) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          {expandedTranscripts.has(step.subId) ? 'Hide transcript' : `View transcript (${transcripts[step.subId].length})`}
                        </button>
                        {expandedTranscripts.has(step.subId) && (
                          <div style={{
                            marginTop: 6, border: '1px solid var(--border-subtle)', borderRadius: 6,
                            padding: '8px 10px', background: 'var(--surface-sidebar)', maxHeight: 280, overflowY: 'auto',
                          }}>
                            {transcripts[step.subId].map((e, i) => (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>{e.label}</div>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>{e.body}</pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>
                    {new Date(step.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}

            {reviewGateVisible && reviewGateData && (
              <div style={{ padding: '4px 24px' }}>
                <ReviewGateCard
                  {...reviewGateData}
                  onConfirm={handleApprove}
                  onEdit={handleEditFirst}
                />
              </div>
            )}

            {running && !reviewGateVisible && (
              <div style={{ display: 'flex', gap: 10, padding: '8px 24px' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--surface-sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <span className="working-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' }} />
                    <span className="working-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' }} />
                    <span className="working-dot" style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' }} />
                  </div>
                </div>
                <div style={{ paddingTop: 6 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Working on it</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
