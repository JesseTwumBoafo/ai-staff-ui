import { describe, it, expect } from 'vitest'
// The deploy engine's pure helpers live in an electron-free CJS module so they
// can be unit-tested here without launching Electron.
import { subst, rosterRows, buildVars } from '../../electron/deploy-lib.cjs'

describe('subst', () => {
  it('replaces known tokens', () => {
    expect(subst('Hi {{OWNER_NAME}}, app {{APP_VERSION}}', { OWNER_NAME: 'Sam', APP_VERSION: '1.2.3' }))
      .toBe('Hi Sam, app 1.2.3')
  })
  it('leaves an unknown token intact so a template typo is visible', () => {
    expect(subst('value: {{MISSING}}', { OWNER_NAME: 'Sam' })).toBe('value: {{MISSING}}')
  })
})

describe('rosterRows', () => {
  it('formats a row per agent with the fixed in-app persona column', () => {
    const out = rosterRows([
      { name: 'Nadia', role: 'Manager', lane: 'orchestration', status: 'active', hired: '2026-07-04' },
      { name: 'Callum', role: 'Writer', lane: 'writing', status: 'active', hired: '2026-07-04' },
    ])
    expect(out.split('\n')).toHaveLength(2)
    expect(out).toContain('| 1 | Nadia | Manager | orchestration | in-app agent | active | 2026-07-04 |')
    expect(out).toContain('| 2 | Callum | Writer | writing | in-app agent | active | 2026-07-04 |')
  })
  it('produces a placeholder row for an empty roster', () => {
    expect(rosterRows([])).toContain('in-app agent')
  })
})

describe('buildVars', () => {
  it('defaults the owner name to Owner when blank', () => {
    const vars = buildVars({ ownerName: '  ', roster: [], appVersion: '0.4.0', date: '2026-07-04' })
    expect(vars.OWNER_NAME).toBe('Owner')
    expect(vars.DATE).toBe('2026-07-04')
    expect(vars.APP_VERSION).toBe('0.4.0')
    expect(vars.ROSTER_COUNT).toBe('0')
  })
  it('trims and keeps a provided owner name', () => {
    expect(buildVars({ ownerName: ' Sam ', roster: [], appVersion: 'x', date: 'd' }).OWNER_NAME).toBe('Sam')
  })
})
