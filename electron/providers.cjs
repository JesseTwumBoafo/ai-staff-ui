// Provider abstraction: one runModel() over Anthropic, OpenAI, Gemini, and any
// OpenAI-compatible local endpoint (Ollama, LM Studio, llama.cpp server).
//
// Internal message/tool shape is Anthropic-flavoured (the orchestrator builds
// it directly). The OpenAI adapter translates to/from chat-completions, retries
// transient failures, and reports token usage.

const { Anthropic } = require('@anthropic-ai/sdk')

const MAX_TOKENS = 8000
const MAX_RETRIES = 3

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  local: 'http://localhost:11434/v1',
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
  })
}

function baseUrlFor(provider, creds) {
  return creds.baseUrl || DEFAULT_BASE_URLS[provider] || DEFAULT_BASE_URLS.local
}

// Translate internal (Anthropic-shaped) messages to OpenAI chat-completions.
function toOpenAIMessages(system, messages) {
  const oa = []
  if (system) oa.push({ role: 'system', content: system })
  for (const m of messages) {
    if (typeof m.content === 'string') {
      oa.push({ role: m.role, content: m.content })
      continue
    }
    if (m.role === 'assistant') {
      const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('')
      const toolCalls = m.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) } }))
      const msg = { role: 'assistant', content: text || null }
      if (toolCalls.length) msg.tool_calls = toolCalls
      oa.push(msg)
    } else {
      const toolResults = m.content.filter(b => b.type === 'tool_result')
      const texts = m.content.filter(b => b.type === 'text')
      for (const tr of toolResults) oa.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: String(tr.content ?? '') })
      if (texts.length) oa.push({ role: 'user', content: texts.map(t => t.text).join('\n') })
    }
  }
  return oa
}

// roleModel: { provider, model }  creds: { apiKey?, baseUrl? }  signal?: AbortSignal
// MCP tools are supplied as ordinary tool definitions (handled by the MCP client),
// so there is no provider-specific MCP handling here.
async function runModel({ roleModel, creds, system, messages, tools, signal }) {
  if (roleModel.provider === 'anthropic') {
    return runAnthropic({ model: roleModel.model, apiKey: creds.apiKey, system, messages, tools, signal })
  }
  return runOpenAICompatible({ model: roleModel.model, apiKey: creds.apiKey, baseUrl: baseUrlFor(roleModel.provider, creds), system, messages, tools, signal })
}

async function runAnthropic({ model, apiKey, system, messages, tools, signal }) {
  const client = new Anthropic({ apiKey })
  const resp = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    tools: tools && tools.length ? tools : undefined,
    messages,
  }, signal ? { signal } : undefined)
  return {
    content: resp.content,
    stop_reason: resp.stop_reason,
    usage: { input: (resp.usage && resp.usage.input_tokens) || 0, output: (resp.usage && resp.usage.output_tokens) || 0 },
  }
}

async function runOpenAICompatible({ model, apiKey, baseUrl, system, messages, tools, signal }) {
  const body = { model, messages: toOpenAIMessages(system, messages), max_tokens: MAX_TOKENS }
  if (tools && tools.length) {
    body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  }
  const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }

  let res
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (res.ok || (res.status !== 429 && res.status < 500) || attempt >= MAX_RETRIES) break
    const retryAfter = parseInt(res.headers.get('retry-after') || '', 10)
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt)
    await sleep(delay, signal)
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} from ${url}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  const choice = (data.choices && data.choices[0]) || {}
  const msg = choice.message || {}

  const content = []
  if (msg.content) content.push({ type: 'text', text: String(msg.content) })
  if (Array.isArray(msg.tool_calls)) {
    for (let i = 0; i < msg.tool_calls.length; i++) {
      const tc = msg.tool_calls[i]
      let input = {}
      try { input = JSON.parse((tc.function && tc.function.arguments) || '{}') } catch { input = {} }
      content.push({ type: 'tool_use', id: tc.id || `call_${i}`, name: tc.function && tc.function.name, input })
    }
  }
  const stop_reason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn'
  const usage = { input: (data.usage && data.usage.prompt_tokens) || 0, output: (data.usage && data.usage.completion_tokens) || 0 }
  return { content, stop_reason, usage }
}

// List available model ids for a provider (live picklists).
async function listModels({ provider, creds }) {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: creds.apiKey })
    const out = []
    for await (const m of client.models.list()) out.push(m.id)
    return out
  }
  const url = `${String(baseUrlFor(provider, creds)).replace(/\/+$/, '')}/models`
  const res = await fetch(url, { headers: creds.apiKey ? { Authorization: `Bearer ${creds.apiKey}` } : {} })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : []
  return list.map(m => m.id || m.name).filter(Boolean)
}

module.exports = { runModel, listModels, toOpenAIMessages }
