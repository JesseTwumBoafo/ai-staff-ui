import { describe, it, expect } from 'vitest'
import { resolveNames, namesFromTeam, validateName } from '../names'

describe('resolveNames', () => {
  it('replaces {{agentId}} tokens with live names', () => {
    const names = { writer: 'Wesley', reviewer: 'Refiloe' }
    expect(resolveNames('Passing to {{writer}}, then {{reviewer}}.', names))
      .toBe('Passing to Wesley, then Refiloe.')
  })

  it('falls back to the id when a token is unknown', () => {
    expect(resolveNames('Ask {{ghost}}.', {})).toBe('Ask ghost.')
  })

  it('leaves untokenised text untouched', () => {
    expect(resolveNames('No tokens here.', { writer: 'Wesley' })).toBe('No tokens here.')
  })
})

describe('namesFromTeam', () => {
  it('builds an id -> name map', () => {
    expect(namesFromTeam([{ id: 'writer', name: 'Wesley' }, { id: 'reviewer', name: 'Refiloe' }]))
      .toEqual({ writer: 'Wesley', reviewer: 'Refiloe' })
  })
})

describe('validateName', () => {
  const team = [{ id: 'writer', name: 'Wesley' }, { id: 'reviewer', name: 'Refiloe' }]
  it('rejects an empty name', () => {
    expect(validateName('  ', 'writer', team)).toMatch(/empty/i)
  })
  it('rejects a duplicate name', () => {
    expect(validateName('Refiloe', 'writer', team)).toMatch(/already called/i)
  })
  it('accepts a unique name', () => {
    expect(validateName('Casey', 'writer', team)).toBeNull()
  })
})
