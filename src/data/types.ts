export type AgentStatus = 'active' | 'paused' | 'archived' | 'retired'
export type FolderPermission = 'read' | 'read-write'

export interface FolderAccess {
  name: string
  // Absolute filesystem path. Present for folders connected via the native
  // picker; absent for the descriptive per-agent access entries in team.ts.
  path?: string
  permission: FolderPermission
  connected: boolean
}

export interface RecentWork {
  id: string
  date: string
  brief: string
  outcome: string
}

export interface Agent {
  id: string
  name: string
  avatarInitials: string
  avatarColour: string
  role: string
  lane: string
  whatIDo: string[]
  whatIWillNotDo: string[]
  folderAccess: FolderAccess[]
  status: AgentStatus
  recentWork: RecentWork[]
  isOrchestrator?: boolean
}

export interface FeedStep {
  id: string
  agentId: string
  agentName: string
  text: string
  timestamp: number
  type: 'routing' | 'read' | 'write' | 'review-gate' | 'complete' | 'undo'
  undone?: boolean
  // 'subagent' steps can be hidden via the per-conversation visibility toggle.
  level?: 'orchestrator' | 'subagent'
  // Links a sub-agent's opening step to its captured transcript.
  subId?: string
}

export interface ReviewGate {
  id: string
  title: string
  summary: string
  proposedAction: string
  recommendation: string
  recommendationLabel: string
  onConfirm: () => void
  onEdit: () => void
}

export interface HiringCandidate {
  id: string
  name: string
  avatarInitials: string
  avatarColour: string
  role: string
  lane: string
  oneLiner: string
  whatIDo: string[]
  whatIWillNotDo: string[]
  defaultFolders: string[]
}

export type AppView = 'home' | 'team' | 'hire' | 'profile' | 'folders' | 'connections' | 'onboarding' | 'settings' | 'vault'

// Operating-system deploy and vault-read model. Deploy scaffolds an ICOR-style
// vault into a chosen folder; the vault types drive the Operating System view.
export interface DeployEntry {
  relPath: string
  kind: 'dir' | 'file'
  action: 'create' | 'keep'
}
export interface DeployPlan {
  root: string
  entries: DeployEntry[]
  warnings: string[]
}
export interface DeployResult {
  ok: boolean
  created: number
  kept: number
  errors: string[]
}
export interface VaultStatus {
  configured: boolean
  root?: string
  agentRoot?: string
  exists: boolean
  hasTeamIndex: boolean
  hasLedger: boolean
  hasSessions: boolean
}
export interface VaultRosterRow {
  name: string
  role: string
  lane: string
  status: string
  hired: string
}
export interface VaultTaskRow {
  id: string
  title: string
  owner: string
  opened: string
  due: string
  status: string
  notes: string
}
export interface VaultSessionRef {
  fileName: string
  date: string
  title: string
}

export interface OnboardingState {
  dismissed: boolean
  folderConnected: boolean
  teamMet: boolean
  firstBriefGiven: boolean
}
