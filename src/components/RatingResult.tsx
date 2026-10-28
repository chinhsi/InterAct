import { useState } from 'react'
import { ratingStats } from '../lib/rating'
import type { Answer, Question } from '../types'

export function RatingResult({ question, answers }: { question: Question; answers: Answer[] }) {
  const storageKey = `interact_rating_iqr_${question.id}`
  const [exclude, setExclude] = useState(() => localStorage.getItem(storageKey) === '1')
  const stats = ratingStats(answers.filter(answer => answer.round === question.answer_round))
  const display = (value: number | null) => value === null ? '—' : value.toFixed(2)
  return <div className="rating-results">
    <p>{question.prompt_text || question.title}</p>
    <div className="rating-summary" aria-live="polite"><span>回應 <strong>{stats.count}</strong> 人</span><span>平均 <strong>{display(exclude ? stats.filteredAverage : stats.average)}</strong> 分</span></div>
    <label className="rating-filter"><input checked={exclude} type="checkbox" onChange={event => { setExclude(event.target.checked); localStorage.setItem(storageKey, event.target.checked ? '1' : '0') }} />移除離群值再平均</label>
    {exclude && <p className="muted">原始平均 {display(stats.average)} 分；剔除 {stats.excludedCount} 筆，採計 {stats.keptCount} 筆。{!stats.canFilter && '不足 5 筆或 IQR 為 0，不剔除。'}</p>}
    <p className="muted rating-rule">IQR 1.5 倍規則，原始回答完整保留；評分題沒有標準答案。</p>
    <div className="rating-distribution" aria-label="原始評分分布">{stats.distribution.map(item => <div key={item.value}><strong>{item.value}</strong><span>{item.count} 人</span></div>)}</div>
  </div>
}
