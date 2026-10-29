export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-interact-client, apikey, content-type',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

export type AiProfile = 'realtime' | 'deep'
export type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export const THINKING_LEVELS: ThinkingLevel[] = ['LOW', 'MEDIUM', 'HIGH']

// Deep analysis defaults to LOW: MEDIUM regularly exhausted the request timeout on
// large sessions, and a report that arrives is worth more than one that never does.
const defaultThinkingLevel: Record<AiProfile, ThinkingLevel> = { realtime: 'LOW', deep: 'LOW' }

export function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  return typeof value === 'string' && (THINKING_LEVELS as string[]).includes(value.toUpperCase())
    ? value.toUpperCase() as ThinkingLevel
    : undefined
}

type GeminiRequestOptions = {
  primaryTimeoutMs?: number
  fallbackTimeoutMs?: number
}

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } }
type GeminiPayload = {
  systemInstruction?: { parts?: GeminiPart[] }
  contents?: Array<{ role?: string; parts?: GeminiPart[] }>
  generationConfig?: { responseFormat?: { text?: { schema?: Record<string, unknown> } } }
}

// The classroom's OpenRouter key is a second billing and API route, not a
// client-side setting. The submitted speech answers are WAV; live captions
// use a separate websocket and are outside this request/response fallback.
function openRouterRequest(body: string, profile: AiProfile) {
  const payload = JSON.parse(body) as GeminiPayload
  const system = payload.systemInstruction?.parts?.map((part) => part.text || '').join('\n') || ''
  const messages: Array<Record<string, unknown>> = []
  if (system) messages.push({ role: 'system', content: system })
  for (const entry of payload.contents || []) {
    const content: Array<Record<string, unknown>> = []
    for (const part of entry.parts || []) {
      if (typeof part.text === 'string') content.push({ type: 'text', text: part.text })
      else if (part.inlineData?.mimeType?.startsWith('image/') && part.inlineData.data) {
        content.push({ type: 'image_url', image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } })
      } else if (part.inlineData?.mimeType === 'audio/wav' && part.inlineData.data) {
        content.push({ type: 'input_audio', input_audio: { data: part.inlineData.data, format: 'wav' } })
      } else return null
    }
    if (content.length) messages.push({ role: entry.role === 'model' ? 'assistant' : 'user', content })
  }
  if (!messages.some((message) => message.role === 'user')) return null
  const schema = payload.generationConfig?.responseFormat?.text?.schema
  return {
    model: Deno.env.get('INTERACT_OPENROUTER_MODEL') || 'google/gemini-3.8-flash',
    messages,
    max_tokens: profile === 'deep' ? 8192 : 4096,
    provider: { require_parameters: true },
    response_format: schema
      ? { type: 'json_schema', json_schema: { name: 'interact_response', strict: true, schema } }
      : { type: 'json_object' },
  }
}

async function requestOpenRouter(body: string, profile: AiProfile, timeoutMs: number) {
  const key = Deno.env.get('INTERACT_OPENROUTER_API_KEY')
  if (!key) throw new Error('OpenRouter is not configured.')
  const request = openRouterRequest(body, profile)
  if (!request) throw new Error('OpenRouter fallback does not support this input type.')
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`OpenRouter HTTP ${response.status}.`)
  }
  const result = await response.json()
  const raw = result.choices?.[0]?.message?.content
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('OpenRouter returned no content.')
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const output = JSON.parse(clean)
  console.info('interact_openrouter_fallback', { model: result.model || request.model, requestId: result.id || null })
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), {
    headers: { 'Content-Type': 'application/json', 'x-interact-ai-route': 'openrouter' },
  })
}

function retryableStatus(status: number) {
  // 404 means this key cannot reach that model, which is exactly what the fallback is for.
  return status === 404 || status === 408 || status === 429 || status >= 500
}

export function geminiModels(profile: AiProfile) {
  // Old endpoint aliases now redirect; call their replacements directly even
  // when an existing deployment still has the old names in its secrets.
  const currentModel = (model: string) => model === 'gemini-3.7-flash'
    ? 'gemini-3.8-flash'
    : model === 'gemini-3.5-flash' ? 'gemini-3.6-flash' : model
  if (profile === 'deep') {
    const primary = currentModel(Deno.env.get('GEMINI_DEEP_MODEL') || Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash')
    const fallback = currentModel(Deno.env.get('GEMINI_DEEP_FALLBACK_MODEL') || Deno.env.get('GEMINI_FALLBACK_MODEL') || 'gemini-3.6-flash')
    return fallback === primary ? [primary] : [primary, fallback]
  }

  const primary = currentModel(Deno.env.get('GEMINI_REALTIME_MODEL') || 'gemini-3.8-flash')
  const fallback = currentModel(Deno.env.get('GEMINI_REALTIME_FALLBACK_MODEL') || 'gemini-3.6-flash')
  return fallback === primary ? [primary] : [primary, fallback]
}

export function geminiThinkingConfig(profile: AiProfile, level?: ThinkingLevel) {
  return { thinkingLevel: level || defaultThinkingLevel[profile] }
}

export async function requestGemini(
  body: string,
  profile: AiProfile,
  options: GeminiRequestOptions = {},
) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  const openRouterKey = Deno.env.get('INTERACT_OPENROUTER_API_KEY')
  const openRouterSupported = Boolean(openRouterKey && openRouterRequest(body, profile))
  const models = openRouterSupported ? geminiModels(profile).slice(0, 1) : geminiModels(profile)
  const primaryTimeoutMs = options.primaryTimeoutMs ?? (profile === 'deep' ? 90_000 : 12_000)
  const fallbackTimeoutMs = options.fallbackTimeoutMs ?? (profile === 'deep' ? 60_000 : 18_000)
  let failureMessage = 'AI request failed.'

  for (const [index, model] of models.entries()) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(index === 0 ? primaryTimeoutMs : fallbackTimeoutMs),
      })
      if (response.ok) return response

      failureMessage = (await response.text()).slice(0, 1000) || `AI request failed with status ${response.status}.`
      if (!retryableStatus(response.status)) {
        const nonRetryableError = new Error(failureMessage)
        nonRetryableError.name = 'NonRetryableGeminiError'
        throw nonRetryableError
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'NonRetryableGeminiError') throw error
      failureMessage = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? `AI request timed out on ${model}.`
        : error instanceof Error ? error.message : 'AI request failed.'
    }

    if (index < models.length - 1) console.warn(`Gemini unavailable on ${model}; switching to ${models[index + 1]}.`)
  }

  if (openRouterSupported) {
    try {
      return await requestOpenRouter(body, profile, profile === 'deep' ? 60_000 : Math.max(20_000, fallbackTimeoutMs))
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'OpenRouter request failed.'
      throw new Error(`Gemini and OpenRouter unavailable: ${detail}`)
    }
  }
  throw new Error(failureMessage)
}

export async function callAiJson(
  systemPrompt: string,
  userPayload: unknown,
  schema?: Record<string, unknown>,
  profile: AiProfile = 'realtime',
  thinkingLevel?: ThinkingLevel,
) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')

  if (!apiKey) {
    return {
      status: 'skipped',
      output: { message: 'GEMINI_API_KEY is not configured.' },
    }
  }

  let response: Response
  try {
    response = await requestGemini(JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(userPayload) }] }],
      generationConfig: {
        thinkingConfig: geminiThinkingConfig(profile, thinkingLevel),
        responseFormat: { text: { mimeType: 'APPLICATION_JSON', ...(schema ? { schema } : {}) } },
      },
    }), profile)
  } catch (error) {
    return { status: 'failed', output: { message: error instanceof Error ? error.message : 'AI request failed.' } }
  }

  const data = await response.json()
  const content = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || ''

  try {
    return { status: 'success', output: JSON.parse(content) }
  } catch {
    return { status: 'success', output: { raw: content } }
  }
}

// Supabase returns plain objects for database and storage failures, not Error
// instances, so `error instanceof Error` discards exactly the detail needed to
// tell a missing table from a rejected key. Read whatever the value actually is.
export function errorDetail(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const shape = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [shape.message, shape.details, shape.hint, shape.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    if (parts.length) return [...new Set(parts)].join(' | ')
    try {
      const serialised = JSON.stringify(error)
      if (serialised && serialised !== '{}') return serialised.slice(0, 300)
    } catch {
      // Circular or otherwise unserialisable — fall through to the caller's wording.
    }
  }
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
