// Shared typings for the Electron preload bridge (window.electronAPI).
// Implemented in electron/preload.cjs and backed by ipcMain handlers in electron/main.cjs.

import type { DeployPlan, DeployResult, VaultStatus, VaultRosterRow } from './data/types'

export interface FolderEntry {
  name: string
  isDirectory: boolean
  size: number
}

export interface PickFolderResult {
  canceled: boolean
  path?: string
}

export interface ListFolderResult {
  ok: boolean
  entries?: FolderEntry[]
  error?: string
}

export interface ReadFileResult {
  ok: boolean
  content?: string
  error?: string
}

export interface WriteFileResult {
  ok: boolean
  path?: string
  error?: string
}

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'local'

export interface RoleModel {
  provider: ProviderName
  model: string
}

export type RoleName = 'orchestrator' | 'researcher' | 'writer' | 'reviewer'

export interface TokenUsage {
  input: number
  output: number
  models?: Record<string, { provider: ProviderName; input: number; output: number }>
}

export interface TranscriptEntry {
  kind: string
  label: string
  body: string
}

export interface AgentSummary {
  id: string
  name: string
  role: string
  whatIDo?: string[]
}

export interface McpServerInfo {
  id: string
  name: string
  transport: 'url' | 'stdio'
  url: string
  command: string
  args: string
  hasToken: boolean
  authState: 'none' | 'token' | 'oauth'
}

export interface ConfigStatus {
  ready: boolean
  encryptionAvailable: boolean
  providers: {
    anthropic: { configured: boolean }
    openai: { configured: boolean }
    gemini: { configured: boolean }
    local: { baseUrl: string }
  }
  // Core roles always present; hired specialists may be added by id.
  roleModels: Record<string, RoleModel>
  mcpServers: McpServerInfo[]
}

export interface AgentDraft {
  filename: string
  content: string
}

export interface RunWriterResult {
  ok: boolean
  draft?: AgentDraft
  error?: string
  aborted?: boolean
  usage?: TokenUsage
}

export interface ReviewWriteResult {
  ok: boolean
  written?: { path: string; name: string; folder: string } | null
  finalContent?: string
  error?: string
  aborted?: boolean
  usage?: TokenUsage
}

export interface AgentEvent {
  type: 'text' | 'tool' | 'error' | 'routing' | 'transcript'
  agentId: string
  text: string
  level: 'orchestrator' | 'subagent'
  subId?: string
  transcript?: TranscriptEntry[]
}

// A connected folder as passed to the agent (mirrors FolderAccess).
export interface ConnectedFolder {
  name: string
  path?: string
  permission: 'read' | 'read-write'
  connected: boolean
}

export interface ElectronAPI {
  // Host platform (process.platform: 'darwin' | 'win32' | 'linux' | ...)
  platform: string
  // Window controls
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (cb: (v: boolean) => void) => () => void
  // Real filesystem access (scoped to folders the user explicitly connects)
  pickFolder: () => Promise<PickFolderResult>
  listFolder: (path: string) => Promise<ListFolderResult>
  readFile: (path: string) => Promise<ReadFileResult>
  writeFile: (folderPath: string, name: string, content: string) => Promise<WriteFileResult>
  // AI connection + agent
  configStatus: () => Promise<ConfigStatus>
  setProviderKey: (provider: 'anthropic' | 'openai' | 'gemini', apiKey: string) => Promise<{ ok: boolean; error?: string }>
  setLocalBaseUrl: (baseUrl: string) => Promise<{ ok: boolean }>
  setRoleModel: (role: string, provider: ProviderName, model: string) => Promise<{ ok: boolean; error?: string }>
  setMcpServer: (server: { id?: string; name: string; transport?: 'url' | 'stdio'; url?: string; command?: string; args?: string; token?: string }) => Promise<{ ok: boolean; id?: string; error?: string }>
  removeMcpServer: (id: string) => Promise<{ ok: boolean }>
  testMcpServer: (id: string) => Promise<{ ok: boolean; name?: string; error?: string }>
  authorizeMcpServer: (id: string) => Promise<{ ok: boolean; error?: string }>
  listModels: (provider: ProviderName) => Promise<{ ok: boolean; models?: string[]; error?: string }>
  runOrchestrator: (brief: string, folders: ConnectedFolder[], team: AgentSummary[]) => Promise<RunWriterResult>
  reviewAndWrite: (brief: string, draft: AgentDraft, folders: ConnectedFolder[]) => Promise<ReviewWriteResult>
  stopAgent: () => Promise<{ ok: boolean }>
  notify: (title: string, body: string) => Promise<{ ok: boolean }>
  onAgentEvent: (cb: (e: AgentEvent) => void) => () => void
  // Operating-system deploy and vault pointer
  deployPlan: (root: string) => Promise<DeployPlan>
  deployApply: (root: string, ownerName: string, roster: VaultRosterRow[]) => Promise<DeployResult>
  vaultStatus: () => Promise<VaultStatus>
  setVaultRoot: (root: string) => Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
