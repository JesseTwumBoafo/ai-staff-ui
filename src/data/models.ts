import type { ProviderName } from '../electron'

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  local: 'Local',
}

export const PROVIDER_ORDER: ProviderName[] = ['anthropic', 'openai', 'gemini', 'local']

// Suggested models per provider for the dependent picklists. Each cloud list
// also offers a "Custom..." entry; local is always free text.
export const MODEL_OPTIONS: Record<ProviderName, string[]> = {
  anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-fable-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  local: [],
}

// USD per 1M tokens, for providers we can price reliably (Anthropic only).
// Used to show an estimated run cost; other providers show tokens only.
export const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
}

// Estimate USD cost from a per-model usage breakdown, summing only models we
// can price. Returns { cost, priced } where priced=false means no known prices.
export function estimateCost(
  models?: Record<string, { provider: string; input: number; output: number }>
): { cost: number; priced: boolean } {
  if (!models) return { cost: 0, priced: false }
  let cost = 0
  let priced = false
  for (const [id, u] of Object.entries(models)) {
    const p = ANTHROPIC_PRICES[id]
    if (u.provider === 'anthropic' && p) {
      cost += (u.input / 1e6) * p.input + (u.output / 1e6) * p.output
      priced = true
    }
  }
  return { cost, priced }
}
