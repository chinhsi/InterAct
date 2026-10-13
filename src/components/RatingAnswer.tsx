import { useState } from 'react'
import { Send } from 'lucide-react'
import { RATING_OPTIONS } from '../lib/rating'

export function RatingAnswer({ english, onSubmit }: { english: boolean; onSubmit: (value: string) => void | Promise<void> }) {
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="rating-answer" onSubmit={async event => {
    event.preventDefault()
    if (!selected || busy) return
    setBusy(true)
    try { await onSubmit(selected) } finally { setBusy(false) }
  }}>
    <div aria-label={english ? 'Rating from 1 to 10' : '選擇 1 到 10 分'} className="rating-scale" role="group">
      {RATING_OPTIONS.map(value => <button aria-pressed={selected === value} className={selected === value ? 'selected-rating' : 'ghost-button'} disabled={busy} key={value} type="button" onClick={() => setSelected(value)}>{value}</button>)}
    </div>
    <div className="rating-endpoints"><span>{english ? '1 · Lowest' : '1 分 · 最低'}</span><span>{english ? '10 · Highest' : '10 分 · 最高'}</span></div>
    <button disabled={!selected || busy} type="submit"><Send size={18} />{english ? (busy ? 'Sending…' : 'Submit answer') : (busy ? '送出中…' : '送出答案')}</button>
  </form>
}
