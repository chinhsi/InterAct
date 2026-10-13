const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const file = 'src/routes/ParticipantPage.tsx'
const text = fs.readFileSync(file, 'utf8')
const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function declaration(name) {
  let result
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) result = 'const ' + node.getText(tree)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert(result)
  return result
}
function compile(code) { return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText }
async function run(sessionResult, stale = false) {
  const calls = []
  const context = {
    isSupabaseConfigured: true, sessionId: 'this-class', participantId: 'student',
    navigator: { onLine: true }, locale: 'zh-TW', participantToken: 'token',
    loadSequence: { current: 0 }, goneSessionId: { current: '' },
    participantRevision: { current: { current: () => 0 } },
    coalescedLoad: { current: fn => fn() }, useCallback: fn => fn,
    setSession: value => calls.push(['session', value]),
    setSessionChecked: value => calls.push(['checked', value]),
    setParticipant: value => calls.push(['participant', value]),
    setQuestion: () => {}, setQuizData: () => {},
  }
  context.requireSupabase = () => ({ from: table => {
    const result = table === 'sessions' ? sessionResult : { data: null, error: { message: 'Cascaded row missing' } }
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      single: () => query, maybeSingle: () => query,
      then: (resolve, reject) => Promise.resolve().then(() => {
        if (stale) context.goneSessionId.current = 'this-class'
        return result
      }).then(resolve, reject),
    }
    return query
  } })
  vm.createContext(context)
  vm.runInContext(compile(declaration('markSessionGone') + ';' + declaration('loadAll') + ';globalThis.load = loadAll'), context)
  await context.load()
  return calls
}
async function main() {
  assert.deepEqual(await run({ data: null, error: null }), [['session', null], ['checked', true], ['participant', null]], 'Confirmed deletion wins over cascaded child errors')
  assert.deepEqual(await run({ data: null, error: { message: 'Network unavailable' } }), [], 'Network errors must not show sayonara')
  assert.deepEqual(await run({ data: { id: 'this-class' }, error: null }, true), [], 'Old snapshot cannot resurrect a removed session')
  let lifecycle
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.getText(tree).includes('participant-session:')) lifecycle = node
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert(lifecycle)
  const dependencies = lifecycle.arguments[1].getText(tree)
  assert(!/liveSessionId|session,|sessionChecked/.test(dependencies), 'Ended classes stay subscribed without snapshot resubscribe loops')
  const handlers = [], calls = []
  const channel = { on: (kind, filter, handler) => { handlers.push({ filter, handler }); return channel }, subscribe: () => channel }
  const context = { isSupabaseConfigured: true, pageVisible: true, sessionId: 'this-class', participantId: 'student', sessionGone: false,
    requireSupabase: () => ({ channel: () => channel, removeChannel: () => calls.push('cleanup') }),
    scheduleLoad: () => {}, markSessionGone: () => calls.push('gone'), useEffect: fn => { context.cleanup = fn() },
  }
  vm.createContext(context)
  vm.runInContext(compile(lifecycle.getText(tree)), context)
  const deletion = handlers.find(item => item.filter.event === 'DELETE')
  assert.equal(deletion.filter.filter, undefined, 'DELETE subscription cannot depend on replica identity full')
  deletion.handler({ old: { id: 'other-class' } })
  assert.deepEqual(calls, [])
  deletion.handler({ old: { id: 'this-class' } })
  assert.deepEqual(calls, ['gone'])
  context.cleanup()
  assert.deepEqual(calls, ['gone', 'cleanup'])
  assert.match(text, /if \(sessionChecked && !session\)/)
  assert.match(fs.readFileSync('src/lib/participantI18n.ts', 'utf8'), /這場次已經莎喲娜啦了！/)
  console.log('PASS: removed sessions, cascading errors, network failures, stale snapshots, ended-class DELETE, isolation and cleanup')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
