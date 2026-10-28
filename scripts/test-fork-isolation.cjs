const assert = require('node:assert/strict')
const fs = require('node:fs')
const schema = fs.readFileSync('supabase/schema.sql', 'utf8')
const hardening = fs.readFileSync('supabase/hardening.sql', 'utf8')
const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/g)].map(match => match[1])
const revoke = schema.match(/^revoke all on ((?:public\.\w+(?:,\s*)?)+) from anon, authenticated;/m)?.[1]
assert(revoke && !/all tables in schema/i.test(revoke), 'schema must not revoke other applications')
const revoked = [...revoke.matchAll(/public\.(\w+)/g)].map(match => match[1])
assert.deepEqual(new Set(revoked), new Set(tables), 'revoke only InterAct tables')
assert(!schema.includes('ts_classes') && !schema.includes('ts_responses'), 'do not touch ten-second-class')
for (const table of ['participant_points', 'board_posts', 'board_reactions']) {
  assert(hardening.includes(`members only: ${table.replaceAll('_', ' ')}`), `missing ${table} member policy`)
}
assert(hardening.includes('own participant only: board posts'), 'board insert must bind to its author')
console.log(`PASS: ${tables.length} InterAct tables scoped; ten-second-class tables untouched; new read/write policies present`)
