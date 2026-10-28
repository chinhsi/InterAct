const assert = require('node:assert/strict')
const fs = require('node:fs')
const schema = fs.readFileSync('supabase/schema.sql', 'utf8')
const hardening = fs.readFileSync('supabase/hardening.sql', 'utf8')
const browser = fs.readFileSync('src/lib/supabase.ts', 'utf8')
const server = fs.readFileSync('supabase/functions/_shared/supabase.ts', 'utf8')
const tables = [...schema.matchAll(/create table if not exists interact\.(\w+)/g)].map(match => match[1])
const revoke = schema.match(/^revoke all on ((?:interact\.\w+(?:,\s*)?)+) from anon, authenticated;/m)?.[1]
assert(revoke && !/all tables in schema/i.test(revoke), 'schema must not revoke other applications')
const revoked = [...revoke.matchAll(/interact\.(\w+)/g)].map(match => match[1])
assert.deepEqual(new Set(revoked), new Set(tables), 'revoke only InterAct tables')
assert(!schema.includes('public.sessions') && !hardening.includes('public.sessions'), 'do not touch an existing public.sessions table')
assert(browser.includes("db: { schema: 'interact' }") && server.includes("db: { schema: 'interact' }"), 'both clients must target interact')
assert(!schema.includes('ts_classes') && !schema.includes('ts_responses'), 'do not touch ten-second-class')
for (const table of ['participant_points', 'board_posts', 'board_reactions']) {
  assert(hardening.includes(`members only: ${table.replaceAll('_', ' ')}`), `missing ${table} member policy`)
}
assert(hardening.includes('own participant only: board posts'), 'board insert must bind to its author')
console.log(`PASS: ${tables.length} InterAct tables scoped; existing public tables untouched; both clients target interact`)
