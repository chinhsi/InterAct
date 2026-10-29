const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync('supabase/functions/_shared/ai.ts', 'utf8')
const env = new Map([['GEMINI_API_KEY', 'google-test'], ['INTERACT_OPENROUTER_API_KEY', 'router-test']])
const calls = []
let googleStatus = 429
let routerStatus = 200
const context = {
  exports: {}, Response, AbortSignal,
  Deno: { env: { get: (name) => env.get(name) } },
  console: { info() {}, warn() {} },
  fetch: async (url, options) => {
    const request = JSON.parse(options.body)
    calls.push({ url, request, auth: options.headers.Authorization })
    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response(googleStatus === 200
        ? JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] })
        : 'google failure', { status: googleStatus })
    }
    return new Response(routerStatus === 200
      ? JSON.stringify({ id: 'test-request', model: 'google/gemini-3.8-flash', choices: [{ message: { content: '{"ok":true}' } }] })
      : 'private upstream detail', { status: routerStatus })
  },
}
vm.createContext(context)
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
const requestGemini = context.exports.requestGemini
const input = (mimeType) => JSON.stringify({
  systemInstruction: { parts: [{ text: 'Return JSON.' }] },
  contents: [{ role: 'user', parts: [
    { text: 'Classroom test' },
    { inlineData: { mimeType, data: 'YQ==' } },
  ] }],
  generationConfig: { responseFormat: { text: { schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } } } },
})

async function main() {
  let response = await requestGemini(input('audio/wav'), 'realtime')
  assert.equal(calls.length, 2, 'one Google attempt then one OpenRouter attempt')
  assert.equal(calls[1].request.messages[1].content[1].type, 'input_audio')
  assert.equal(calls[1].request.messages[1].content[1].input_audio.format, 'wav')
  assert.equal(calls[1].request.response_format.type, 'json_schema')
  assert.equal(calls[1].auth, 'Bearer router-test')
  assert.equal((await response.json()).candidates[0].content.parts[0].text, '{"ok":true}')

  calls.length = 0
  response = await requestGemini(input('image/png'), 'realtime')
  assert.equal(calls[1].request.messages[1].content[1].type, 'image_url')
  assert.match(calls[1].request.messages[1].content[1].image_url.url, /^data:image\/png;base64,/)
  assert.equal(response.headers.get('x-interact-ai-route'), 'openrouter')

  calls.length = 0
  googleStatus = 200
  response = await requestGemini(input('audio/wav'), 'realtime')
  assert.equal(calls.length, 1, 'healthy Gemini must not spend OpenRouter credits')
  assert.equal(response.headers.get('x-interact-ai-route'), null)

  calls.length = 0
  googleStatus = 400
  await assert.rejects(requestGemini(input('audio/wav'), 'realtime'), /google failure/)
  assert.equal(calls.length, 1, 'bad requests must not be re-sent to OpenRouter')

  calls.length = 0
  googleStatus = 429
  routerStatus = 503
  await assert.rejects(requestGemini(input('audio/wav'), 'realtime'), /OpenRouter HTTP 503/)
  assert.equal(calls.length, 2)

  calls.length = 0
  routerStatus = 200
  await assert.rejects(requestGemini(input('application/pdf'), 'realtime'), /google failure/)
  assert.equal(calls.length, 2, 'unsupported file input keeps both Gemini models and never sends to OpenRouter')
  assert(calls.every((call) => call.url.includes('generativelanguage.googleapis.com')))
  console.log('PASS: Gemini primary, OpenRouter text/image/audio fallback, no resend on 400, clean failure and unsupported files')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
