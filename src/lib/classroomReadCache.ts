// Per-page, per-learner cache. Realtime invalidates only the affected source;
// reconnect clears everything. Expiry is a safety net for a missed event.
// Never cache an error or let an older in-flight read refill an invalidated key.
export function createClassroomReadCache(now = Date.now) {
  let scope = ''
  const entries = new Map<string, { expires: number; value: unknown; pending?: Promise<unknown> }>()
  return {
    scope(next: string) { if (scope !== next) { scope = next; entries.clear() } },
    invalidate(...sources: string[]) {
      if (!sources.length) { entries.clear(); return }
      for (const key of entries.keys()) if (sources.some(source => key === source || key.startsWith(source + ':'))) entries.delete(key)
    },
    async read<T>(key: string, load: () => PromiseLike<T>, maxAge = 60_000, emptyAge = maxAge): Promise<T> {
      const existing = entries.get(key)
      if (existing?.pending) return existing.pending as Promise<T>
      if (existing && existing.expires > now()) return existing.value as T
      if (entries.size > 512) entries.clear()
      const entry = { expires: 0, value: undefined as unknown, pending: undefined as Promise<unknown> | undefined }
      entries.set(key, entry)
      const pending = Promise.resolve().then(load).then(value => {
        const response = value as { error?: unknown; data?: unknown } | null
        if (entries.get(key) === entry) {
          if (response?.error) entries.delete(key)
          else { entry.value = value; entry.expires = now() + (value === null || response?.data === null ? emptyAge : maxAge); entry.pending = undefined }
        }
        return value
      }, error => { if (entries.get(key) === entry) entries.delete(key); throw error })
      entry.pending = pending
      return pending
    },
  }
}

// Realtime remains the fast path. Waiting on AI must not make 200 browsers
// hammer every 1.5 s indefinitely; spread retries and back off a long wait.
export function classroomRetryDelay(waitingMs: number, random = Math.random()) {
  return (waitingMs < 10_000 ? 1500 : waitingMs < 60_000 ? 3500 : 8000)
    + Math.floor(Math.max(0, Math.min(1, random)) * 1500)
}
