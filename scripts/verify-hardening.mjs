// End-to-end check of hardening.sql against a live project.
// Usage: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... INTERACT_OWNER_KEY=... node scripts/verify-hardening.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY
const ownerKey = process.env.INTERACT_OWNER_KEY
if (!url || !key || !ownerKey) throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and INTERACT_OWNER_KEY are required')

const results = []
function check(label, ok, detail = '') {
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

function client() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function anon(label) {
  const c = client()
  const { data, error } = await c.auth.signInAnonymously()
  if (error) throw new Error(`${label}: anonymous sign-in failed: ${error.message}`)
  return { c, uid: data.user.id }
}

async function count(c, table) {
  const { data, error } = await c.from(table).select('id')
  if (error) return { error: error.message }
  return { rows: data.length }
}

// 1. Bare publishable key, no user: nothing readable.
{
  const c = client()
  const r = await count(c, 'sessions')
  check('bare key cannot list sessions', r.rows === 0, JSON.stringify(r))
}

// 2. Presenter: anonymous user + owner key -> create session -> becomes presenter.
const presenter = await anon('presenter')
const created = await presenter.c.functions.invoke('create-session', {
  body: { title: 'hardening-verify', ownerKey },
  headers: { 'x-interact-client': 'windows-app' },
})
if (created.error) {
  let detail = created.error.message
  try { detail += ' ' + JSON.stringify(await created.error.context?.json()) } catch {}
  throw new Error(`create-session failed: ${detail}`)
}
const { sessionId, code, presenterToken } = created.data
check('create-session with owner key', Boolean(sessionId && code && presenterToken))
{
  const r = await count(presenter.c, 'sessions')
  check('presenter reads its session', r.rows >= 1, JSON.stringify(r))
}

// 3. Stranger: anonymous user who never joined sees nothing.
const stranger = await anon('stranger')
{
  const r = await count(stranger.c, 'sessions')
  check('stranger cannot list sessions', r.rows === 0, JSON.stringify(r))
  const one = await stranger.c.from('sessions').select('id').eq('id', sessionId).maybeSingle()
  check('stranger cannot read session by id', one.data === null && !one.error, JSON.stringify(one))
}

// 4. Student: lookup by code, join, then sees exactly that session.
const student = await anon('student')
const lookup = await student.c.functions.invoke('participant-action', { body: { action: 'lookup_session', sessionReference: code } })
check('lookup_session by code', lookup.data?.session?.id === sessionId, lookup.error?.message || '')
const join = await student.c.functions.invoke('participant-action', {
  body: { action: 'join_session', sessionReference: sessionId, name: '測試學生', deviceId: `verify-${Date.now()}` },
})
if (join.error) {
  let detail = join.error.message
  try { detail += ' ' + JSON.stringify(await join.error.context?.json()) } catch {}
  throw new Error(`join_session failed: ${detail}`)
}
const participant = join.data.participant
check('join_session records auth_uid', participant.auth_uid === student.uid, `auth_uid=${participant.auth_uid}`)
{
  const r = await count(student.c, 'sessions')
  check('student sees exactly one session', r.rows === 1, JSON.stringify(r))
  const p = await count(student.c, 'participants')
  check('student reads participants of own session', p.rows === 1, JSON.stringify(p))
  const s = await count(stranger.c, 'participants')
  check('stranger still sees no participants', s.rows === 0, JSON.stringify(s))
}

// 5. Student can post danmaku as self, not as someone else.
{
  const mine = await student.c.from('messages').insert({
    session_id: sessionId, participant_id: participant.id, participant_name: participant.name, content: 'hello',
  })
  check('student inserts own message', !mine.error, mine.error?.message || '')
  const spoof = await stranger.c.from('messages').insert({
    session_id: sessionId, participant_id: participant.id, participant_name: participant.name, content: 'spoof',
  })
  check('stranger cannot post as the student', Boolean(spoof.error), spoof.error?.message || 'insert succeeded')
  const m = await count(presenter.c, 'messages')
  check('presenter reads messages', m.rows === 1, JSON.stringify(m))
}

// 5b. Joining with a classmate's device_id must not hand over their row.
{
  const hijack = await stranger.c.functions.invoke('participant-action', {
    body: { action: 'join_session', sessionReference: sessionId, name: '冒名者', deviceId: participant.device_id },
  })
  const got = hijack.data?.participant
  let hijackDetail = `id=${got?.id}`
  if (hijack.error) {
    hijackDetail = hijack.error.message
    try { hijackDetail += ' ' + JSON.stringify(await hijack.error.context?.json()) } catch {}
  }
  check('join with stolen device_id yields a separate participant', Boolean(got) && got.id !== participant.id, hijackDetail)
  const victim = await student.c.from('participants').select('auth_uid').eq('id', participant.id).single()
  check('victim row keeps its auth_uid', victim.data?.auth_uid === student.uid, JSON.stringify(victim.data))
  const again = await student.c.functions.invoke('participant-action', {
    body: { action: 'join_session', sessionReference: sessionId, name: participant.name, deviceId: participant.device_id },
  })
  check('victim rejoining gets the same row', again.data?.participant?.id === participant.id, again.error?.message || '')
}

// 5c. claim_buzzer without the participant token is refused.
{
  const buzz = await stranger.c.functions.invoke('participant-action', {
    body: { action: 'claim_buzzer', sessionId, participantId: participant.id, eventId: crypto.randomUUID() },
  })
  const status = buzz.error?.context?.status
  check('claim_buzzer without token is refused', status === 401, `status=${status ?? 'ok'}`)
}

// 5d. Presence RPC is no longer callable from the browser.
{
  const rpc = await stranger.c.rpc('bump_participant_presence', { target_id: participant.id, unfocused_delta: 1, focus_streak: 1 })
  check('bump_participant_presence not callable by anon', Boolean(rpc.error), rpc.error?.message || 'call succeeded')
}

// 6. Second student in a different (nonexistent) session cannot see this one.
{
  const other = await anon('other')
  const r = await count(other.c, 'answers')
  check('unjoined user sees no answers', r.rows === 0, JSON.stringify(r))
}

// 7. Realtime: the student's subscription must deliver changes on its own
// session, and a stranger's must stay silent. Both run under the same RLS.
{
  const seen = { student: 0, stranger: 0 }
  const subscribe = (c, who) => new Promise((resolve, reject) => {
    const channel = c.channel(`verify:${who}:${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, () => {
        seen[who] += 1
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve(channel)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`${who} realtime ${status}: ${err?.message || ''}`))
      })
  })
  // 'stranger' became a member in 5b, so use a fresh outsider here.
  const outsider = await anon('outsider')
  const studentChannel = await subscribe(student.c, 'student')
  const strangerChannel = await subscribe(outsider.c, 'stranger')
  await new Promise((r) => setTimeout(r, 1500))
  const upd = await presenter.c.functions.invoke('presenter-action', {
    body: { action: 'update_session', sessionId, presenterToken, danmakuEnabled: false },
  })
  check('presenter update_session', !upd.error, upd.error?.message || '')
  await new Promise((r) => setTimeout(r, 4000))
  check('student realtime receives own session update', seen.student >= 1, `events=${seen.student}`)
  check('outsider realtime receives nothing', seen.stranger === 0, `events=${seen.stranger}`)
  await student.c.removeChannel(studentChannel)
  await outsider.c.removeChannel(strangerChannel)
}

// Cleanup.
const del = await presenter.c.functions.invoke('presenter-action', {
  body: { action: 'delete_session', sessionId, presenterToken, ownerKey },
})
check('delete_session cleanup', !del.error, del.error?.message || '')

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
