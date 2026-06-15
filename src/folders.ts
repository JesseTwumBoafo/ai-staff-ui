// Persistence for connected folders (real filesystem paths the user has picked).
// Mirrors the storage pattern used for names and theme.

import type { FolderAccess } from './data/types'

const STORAGE_KEY = 'ai-staff-folders'

export function getStoredFolders(): FolderAccess[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (f): f is FolderAccess =>
          f && typeof f.name === 'string' && (f.permission === 'read' || f.permission === 'read-write')
      )
    }
  } catch {
    // ignore
  }
  return []
}

export function storeFolders(folders: FolderAccess[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
  } catch {
    // ignore
  }
}

// Derive a display name (basename) from an absolute path, handling both separators.
export function folderNameFromPath(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}
