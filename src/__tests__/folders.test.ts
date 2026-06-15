import { describe, it, expect } from 'vitest'
import { folderNameFromPath } from '../folders'

describe('folderNameFromPath', () => {
  it('takes the basename of a Windows path', () => {
    expect(folderNameFromPath('C:\\Users\\you\\Projects')).toBe('Projects')
  })
  it('takes the basename of a POSIX path', () => {
    expect(folderNameFromPath('/home/you/Notes')).toBe('Notes')
  })
  it('ignores a trailing separator', () => {
    expect(folderNameFromPath('D:\\Work\\Clients\\')).toBe('Clients')
  })
})
