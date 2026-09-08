import { getAdminClient } from './supabase.ts'

// Every InterAct browser signs in anonymously, so a request normally carries a
// user JWT rather than the bare publishable key. The uid it resolves to is what
// the row-level policies in hardening.sql key on.
export async function callerUid(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  if (token.startsWith('sb_publishable_') || token === (Deno.env.get('SUPABASE_ANON_KEY') || '')) return null
  try {
    const { data, error } = await getAdminClient().auth.getUser(token)
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

// Called only after the owner key has been verified: from then on this
// browser's uid may read every session in the project.
export async function registerPresenter(supabase: ReturnType<typeof getAdminClient>, uid: string | null) {
  if (!uid) return
  const { error } = await supabase
    .from('presenter_uids')
    .upsert({ uid, last_seen_at: new Date().toISOString() })
  if (error) console.error('registerPresenter failed', error)
}
