// Persistence for completed run transcripts (saved conversations).

import type { FeedStep } from './data/types'

const STORAGE_KEY = 'ai-staff-runs'
const MAX_RUNS = 30

export interface SavedRun {
  id: string
  title: string
  timestamp: number
  steps: FeedStep[]
  // Context for resuming the conversation.
  brief?: string
  deliverable?: string
}

export function getRuns(): SavedRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRun(data: { title: string; steps: FeedStep[]; brief?: string; deliverable?: string }): SavedRun {
  const run: SavedRun = {
    id: `run-${Date.now()}`,
    title: (data.title || 'Untitled run').slice(0, 120),
    timestamp: Date.now(),
    steps: data.steps,
    brief: data.brief,
    deliverable: data.deliverable,
  }
  try {
    const next = [run, ...getRuns()].slice(0, MAX_RUNS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  return run
}

export function deleteRun(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getRuns().filter(r => r.id !== id)))
  } catch {
    // ignore
  }
}
