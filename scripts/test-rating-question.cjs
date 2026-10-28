const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const ratingModule = { exports: {} }
vm.runInNewContext(compile(fs.readFileSync('supabase/functions/_shared/rating.ts', 'utf8')), ratingModule)
const { ratingStats, RATING_OPTIONS } = ratingModule.exports
const samples = values => values.map(value => ({ answer_value: String(value) }))
assert.equal(RATING_OPTIONS.length, 10)
assert.equal(ratingStats([]).average, null)
assert.equal(ratingStats(samples([1, 10])).average, 5.5)
assert.equal(ratingStats(samples([0, 11, 1.5, '', 5])).count, 1)
assert.equal(ratingStats(samples([8, 8, 8, 8, 1])).excludedCount, 0, 'Zero IQR must not discard minority opinions')
const sourceAnswers = samples([1, 8, 8, 9, 9, 10, 10])
const before = JSON.stringify(sourceAnswers)
const stats = ratingStats(sourceAnswers)
assert.equal(stats.excludedCount, 1)
assert.equal(stats.filteredAverage, 9)
assert.equal(stats.average, 55 / 7)
assert.equal(JSON.stringify(sourceAnswers), before, 'Raw answers stay unchanged')
assert.equal(ratingStats(samples([1, 2, 8, 10])).excludedCount, 0, 'Small samples stay intact')

function component(file) {
  const context = { exports: {}, require: name => name.includes('/rating') ? ratingModule.exports : require(name) }
  vm.runInNewContext(compile(fs.readFileSync(file, 'utf8')), context)
  return context.exports
}
const { RatingAnswer } = component('src/components/RatingAnswer.tsx')
for (const english of [false, true]) {
  const html = renderToStaticMarkup(React.createElement(RatingAnswer, { english, onSubmit: () => {} }))
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 10)
  assert.match(html, english ? /Submit answer/ : /送出答案/)
  assert.match(html, /disabled="" type="submit"/)
}
const participant = fs.readFileSync('src/components/ParticipantQuestionView.tsx', 'utf8')
assert.match(participant, /question.type === 'rating'.*RatingAnswer/)
const editor = fs.readFileSync('src/components/QuestionEditor.tsx', 'utf8')
const types = [...editor.matchAll(/type: '([^']+)', label: /g)].map(match => match[1])
assert.equal(types.length % 2, 0, 'Question grid has an even number of choices')
assert(types.includes('rating'))
const presenter = fs.readFileSync('supabase/functions/presenter-action/index.ts', 'utf8')
assert.match(presenter, /type === 'rating' \? RATING_OPTIONS/)
assert.match(presenter, /promptText = await generateRatingPrompt/)
assert.match(presenter, /question.type === 'rating'.*沒有標準答案/)
const schema = fs.readFileSync('supabase/schema.sql', 'utf8')
assert.match(schema, /"valid rating answers" on public.answers as restrictive/)
assert.match(schema, /answer_value in \('1','2','3','4','5','6','7','8','9','10'\)/)
assert.match(schema, /answer_values is null and answer_text is null and is_correct is null/)
for (const file of ['supabase/functions/analyze-question/index.ts', 'supabase/functions/analyze-session/index.ts']) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /from\('answers'\)\.select\('[^']*round'/, 'Analysis loads the round needed for rating statistics')
  assert.match(source, /rating_round: question.answer_round/)
}
console.log('PASS: 1–10 choices, explicit submit, bilingual rendering, even grid, averages/IQR, small samples, immutable originals and database validation')

async function testImageRecognition() {
  let requestBody
  const context = { exports: {}, btoa: value => Buffer.from(value, 'binary').toString('base64'),
    fetch: async () => ({ ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
    require: () => ({ geminiThinkingConfig: () => ({ thinkingLevel: 'LOW' }),
      requestGemini: async body => { requestBody = JSON.parse(body); return { json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: '請為圖片中的作品評分（1～10分）' }) }] } }] }) } },
    }),
  }
  vm.createContext(context)
  vm.runInContext(compile(fs.readFileSync('supabase/functions/_shared/question-items.ts', 'utf8')), context)
  const title = await context.exports.generateRatingPrompt('https://example.test/screenshot.png', '作品完成度')
  assert.match(title, /作品評分/)
  assert.equal(requestBody.contents[0].parts[1].inlineData.mimeType, 'image/png')
  assert.equal(requestBody.contents[0].parts[1].inlineData.data, 'AQID')
  assert.match(requestBody.contents[0].parts[0].text, /作品完成度/)
  assert.equal(requestBody.generationConfig.thinkingConfig.thinkingLevel, 'LOW')
  console.log('PASS: screenshot pixels and teacher direction reach the rating AI request (mock only, no paid calls)')
}
testImageRecognition().catch(error => { console.error(error); process.exitCode = 1 })
