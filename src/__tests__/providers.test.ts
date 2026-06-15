import { describe, it, expect } from 'vitest'
// The provider layer is CJS (runs in the Electron main process).
import { toOpenAIMessages } from '../../electron/providers.cjs'

describe('toOpenAIMessages', () => {
  it('prepends the system prompt and passes string user turns through', () => {
    const oa = toOpenAIMessages('be brief', [{ role: 'user', content: 'hello' }])
    expect(oa[0]).toEqual({ role: 'system', content: 'be brief' })
    expect(oa[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('maps an assistant tool_use block to an OpenAI tool_call', () => {
    const oa = toOpenAIMessages('', [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'read_file', input: { file: 'a.md' } }] },
    ])
    const msg = oa[0]
    expect(msg.role).toBe('assistant')
    expect(msg.tool_calls[0]).toMatchObject({ id: 'tu_1', type: 'function', function: { name: 'read_file' } })
    expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual({ file: 'a.md' })
  })

  it('maps a tool_result block to an OpenAI tool message', () => {
    const oa = toOpenAIMessages('', [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'file body' }] },
    ])
    expect(oa[0]).toEqual({ role: 'tool', tool_call_id: 'tu_1', content: 'file body' })
  })
})
