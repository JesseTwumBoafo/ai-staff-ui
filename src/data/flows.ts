import type { FeedStep } from './types'

export interface ScriptedFlow {
  id: string
  label: string
  briefText: string
  steps: Omit<FeedStep, 'id' | 'timestamp'>[]
  hasReviewGate?: boolean
  reviewGateIndex?: number
}

export const CANNED_BRIEFS: ScriptedFlow[] = [
  {
    id: 'write-summary',
    label: 'Write a summary of the Q2 client review',
    briefText: 'Write a summary of the Q2 client review',
    hasReviewGate: true,
    reviewGateIndex: 4,
    steps: [
      {
        agentId: 'orchestrator',
        agentName: 'Nadia',
        text: 'I\'ve received your brief. This looks like a writing task, so I\'m passing it to {{writer}}.',
        type: 'routing',
      },
      {
        agentId: 'orchestrator',
        agentName: 'Nadia',
        text: 'I\'m also looping in {{reviewer}} to review the draft before it comes back to you.',
        type: 'routing',
      },
      {
        agentId: 'writer',
        agentName: 'Callum',
        text: 'Reading your Q2 notes from the Projects folder.',
        type: 'read',
      },
      {
        agentId: 'writer',
        agentName: 'Callum',
        text: 'Draft complete: four-page summary covering key client outcomes, actions, and next steps.',
        type: 'write',
      },
      {
        agentId: 'reviewer',
        agentName: 'Priya',
        text: 'Reviewing {{writer}}\'s draft now. Checking for accuracy, tone, and completeness.',
        type: 'read',
      },
      {
        agentId: 'reviewer',
        agentName: 'Priya',
        text: 'Review complete. Two small edits applied. The draft is ready for your approval.',
        type: 'review-gate',
      },
    ],
  },
  {
    id: 'research-competitors',
    label: 'Research competitor pricing for the Friday pitch',
    briefText: 'Research competitor pricing for the Friday pitch',
    steps: [
      {
        agentId: 'orchestrator',
        agentName: 'Nadia',
        text: 'This is a research task. I\'m handing it to {{researcher}}.',
        type: 'routing',
      },
      {
        agentId: 'researcher',
        agentName: 'Sasha',
        text: 'Reading the Friday pitch brief from your Projects folder to understand what comparisons you need.',
        type: 'read',
      },
      {
        agentId: 'researcher',
        agentName: 'Sasha',
        text: 'Searching your Notes folder for any existing market data.',
        type: 'read',
      },
      {
        agentId: 'researcher',
        agentName: 'Sasha',
        text: 'Research complete. Three-page briefing with five sources saved to your Notes folder.',
        type: 'write',
      },
      {
        agentId: 'orchestrator',
        agentName: 'Nadia',
        text: '{{researcher}} has finished. The briefing is in your Notes folder. No approval needed for a read-only research task.',
        type: 'complete',
      },
    ],
  },
  {
    id: 'prepare-agenda',
    label: 'Prepare an agenda for the Friday team meeting',
    briefText: 'Prepare an agenda for the Friday team meeting',
    hasReviewGate: true,
    reviewGateIndex: 3,
    steps: [
      {
        agentId: 'orchestrator',
        agentName: 'Nadia',
        text: 'This is a writing and scheduling task. {{writer}} will draft the agenda.',
        type: 'routing',
      },
      {
        agentId: 'writer',
        agentName: 'Callum',
        text: 'Reading your recent notes and any existing meeting prep from the Notes folder.',
        type: 'read',
      },
      {
        agentId: 'writer',
        agentName: 'Callum',
        text: 'Agenda drafted: five agenda items, timings, and owners. Ready for your review before saving.',
        type: 'write',
      },
      {
        agentId: 'orchestrator',
        agentName: 'Nadia',
        text: '{{writer}} has a draft ready. I\'m pausing here for your approval before saving it to Projects.',
        type: 'review-gate',
      },
    ],
  },
]

export const GENERIC_FLOW: Omit<FeedStep, 'id' | 'timestamp'>[] = [
  {
    agentId: 'orchestrator',
    agentName: 'Nadia',
    text: 'I\'ve received your brief. Let me work out who is best placed to handle this.',
    type: 'routing',
  },
  {
    agentId: 'orchestrator',
    agentName: 'Nadia',
    text: 'This looks like it calls for {{writer}}\'s writing skills. I\'m passing it over.',
    type: 'routing',
  },
  {
    agentId: 'writer',
    agentName: 'Callum',
    text: 'Reading the relevant documents from your Projects folder.',
    type: 'read',
  },
  {
    agentId: 'writer',
    agentName: 'Callum',
    text: 'Work complete. The output is ready for your review.',
    type: 'write',
  },
  {
    agentId: 'orchestrator',
    agentName: 'Nadia',
    text: '{{writer}} has finished. Passing to {{reviewer}} for a quick quality check before it reaches you.',
    type: 'routing',
  },
  {
    agentId: 'reviewer',
    agentName: 'Priya',
    text: 'Reviewing now.',
    type: 'read',
  },
  {
    agentId: 'reviewer',
    agentName: 'Priya',
    text: 'Looks good. Ready for your final approval.',
    type: 'review-gate',
  },
]
