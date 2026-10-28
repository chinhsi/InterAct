// A rejected track does not necessarily disconnect the socket. Retry a few
// times, spaced below the per-client Presence limit, and stop on unmount.
export function createPresencePublisher(send: () => Promise<string>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  const cancel = () => { generation++; clearTimeout(timer) }
  return {
    cancel,
    start() {
      cancel()
      const current = generation
      const attempt = async (index: number) => {
        let result = 'error'
        try { result = await send() } catch { /* A reconnect or the next retry recovers. */ }
        if (current !== generation || result === 'ok' || index >= 3) return
        timer = setTimeout(() => void attempt(index + 1), [1500, 5000, 15_000][index] + Math.random() * 1000)
      }
      void attempt(0)
    },
  }
}
