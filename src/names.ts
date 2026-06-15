// Persistence for custom agent names.
// Shape: { [agentId: string]: string }
// Storage key mirrors the theme key pattern.

const STORAGE_KEY = 'ai-staff-names'

export function getStoredNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string>
  } catch {
    // ignore
  }
  return {}
}

export function storeName(agentId: string, name: string) {
  try {
    const current = getStoredNames()
    current[agentId] = name
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // ignore
  }
}

export function resetStoredNames() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// Resolve {{agentId}} tokens in scripted copy to the agent's current name.
// Scripted strings (flows, recent-work outcomes, onboarding copy) reference
// other agents by token so they track renames instead of baking in defaults.
export function resolveNames(text: string, names: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, id) => names[id] ?? id)
}

// Build an id -> current name map from a team array.
export function namesFromTeam(team: { id: string; name: string }[]): Record<string, string> {
  return Object.fromEntries(team.map(a => [a.id, a.name]))
}

// Validation rules (shared between hire flow and profile rename).
export const NAME_MAX_LENGTH = 24

export function validateName(
  value: string,
  currentAgentId: string,
  activeTeam: { id: string; name: string }[]
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Name cannot be empty.'
  if (trimmed.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or fewer.`
  const duplicate = activeTeam.find(
    a => a.id !== currentAgentId && a.name.toLowerCase() === trimmed.toLowerCase()
  )
  if (duplicate) return `Someone on the team is already called ${duplicate.name}.`
  return null
}
