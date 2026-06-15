import type { Agent } from './types'

export const INITIAL_TEAM: Agent[] = [
  {
    id: 'orchestrator',
    name: 'Nadia',
    avatarInitials: 'N',
    avatarColour: '#4f46e5',
    role: 'Your manager',
    lane: 'orchestration',
    isOrchestrator: true,
    whatIDo: [
      'Receives every brief you give and decides who handles it',
      'Narrates routing decisions so you always know what is happening',
      'Hands work to the right specialist, then brings the result back to you',
      'Flags anything that needs your sign-off before it goes further',
    ],
    whatIWillNotDo: [
      'Make changes to your files without telling you first',
      'Send anything external without a review gate',
      'Pass work to a specialist who does not have access to the relevant folder',
    ],
    folderAccess: [
      { name: 'Projects', permission: 'read', connected: true },
      { name: 'Clients', permission: 'read', connected: true },
      { name: 'Notes', permission: 'read', connected: true },
    ],
    status: 'active',
    recentWork: [
      {
        id: 'rw1',
        date: '2026-06-11',
        brief: 'Write a summary of the Q2 client review',
        outcome: 'Routed to {{writer}} (writer), then {{reviewer}} (reviewer). Draft ready for your approval.',
      },
      {
        id: 'rw2',
        date: '2026-06-10',
        brief: 'Research competitor pricing for the Friday pitch',
        outcome: 'Routed to {{researcher}} (researcher). Three-page briefing saved to Projects.',
      },
    ],
  },
  {
    id: 'writer',
    name: 'Callum',
    avatarInitials: 'C',
    avatarColour: '#0891b2',
    role: 'Writes things',
    lane: 'writing',
    whatIDo: [
      'Drafts documents, reports, summaries, and emails from your brief',
      'Reads source material from your connected folders to inform the draft',
      'Follows your house style and preferred tone',
      'Returns a finished draft for your review before anything is saved or sent',
    ],
    whatIWillNotDo: [
      'Publish or send anything without your approval',
      'Access folders outside the ones listed below',
      'Rewrite documents that are marked as final',
    ],
    folderAccess: [
      { name: 'Projects', permission: 'read-write', connected: true },
      { name: 'Notes', permission: 'read', connected: true },
    ],
    status: 'active',
    recentWork: [
      {
        id: 'rw3',
        date: '2026-06-11',
        brief: 'Draft a Q2 client review summary',
        outcome: 'Four-page summary written and passed to {{reviewer}} for review.',
      },
      {
        id: 'rw4',
        date: '2026-06-09',
        brief: 'Write an agenda for the Friday team meeting',
        outcome: 'One-page agenda saved to Projects. Approved by you.',
      },
    ],
  },
  {
    id: 'researcher',
    name: 'Sasha',
    avatarInitials: 'S',
    avatarColour: '#059669',
    role: 'Does research',
    lane: 'research',
    whatIDo: [
      'Finds and synthesises information from your connected folders',
      'Produces structured briefings, comparisons, and summaries',
      'Flags sources and notes confidence level when uncertain',
      'Saves findings to your Notes or Projects folder',
    ],
    whatIWillNotDo: [
      'Make up sources or invent facts',
      'Modify existing documents (read-only)',
      'Access your Clients folder without explicit permission',
    ],
    folderAccess: [
      { name: 'Notes', permission: 'read-write', connected: true },
      { name: 'Projects', permission: 'read', connected: true },
    ],
    status: 'active',
    recentWork: [
      {
        id: 'rw5',
        date: '2026-06-10',
        brief: 'Research competitor pricing',
        outcome: 'Three-page briefing with five sources saved to Notes.',
      },
    ],
  },
  {
    id: 'reviewer',
    name: 'Priya',
    avatarInitials: 'P',
    avatarColour: '#d97706',
    role: 'Checks quality',
    lane: 'review',
    whatIDo: [
      'Reviews drafts from {{writer}} and other specialists before they reach you',
      'Checks for accuracy, tone, completeness, and consistency',
      'Returns a verdict with specific feedback, not just a pass or fail',
      'Can request a revision from the original specialist on your behalf',
    ],
    whatIWillNotDo: [
      'Approve something she is not confident in',
      'Modify the original document (read-only except for review annotations)',
      'Bypass the review gate, even if the brief is time-sensitive',
    ],
    folderAccess: [
      { name: 'Projects', permission: 'read', connected: true },
      { name: 'Notes', permission: 'read', connected: true },
    ],
    status: 'active',
    recentWork: [
      {
        id: 'rw6',
        date: '2026-06-11',
        brief: 'Review Q2 client summary draft',
        outcome: 'Passed with two minor edits noted. Ready for your approval.',
      },
    ],
  },
  {
    id: 'recruiter',
    name: 'Harvey',
    avatarInitials: 'H',
    avatarColour: '#7c3aed',
    role: 'Grows the team',
    lane: 'hiring',
    whatIDo: [
      'Identifies capability gaps as your needs change',
      'Drafts new specialist personas for you to approve',
      'Onboards approved specialists into the right work stream',
      'Keeps the roster lean, flagging specialists you no longer need',
    ],
    whatIWillNotDo: [
      'Add a specialist without your approval',
      'Change an existing specialist\'s remit on its own',
      'Grant a new specialist folder access you have not approved',
    ],
    folderAccess: [
      { name: 'Notes', permission: 'read', connected: true },
    ],
    status: 'active',
    recentWork: [
      {
        id: 'rw7',
        date: '2026-06-12',
        brief: 'Scope a data-analyst specialist',
        outcome: 'Drafted a persona and folder scope for your approval.',
      },
    ],
  },
]
