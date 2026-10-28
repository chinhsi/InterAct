export const RATING_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 1))

export function ratingStats(answers: Array<{ answer_value?: string | null }>) {
  const values = answers.map(answer => answer.answer_value)
    .filter((value): value is string => typeof value === 'string' && RATING_OPTIONS.includes(value))
    .map(Number).sort((a, b) => a - b)
  const mean = (items: number[]) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null
  const quantile = (fraction: number) => {
    const position = (values.length - 1) * fraction
    const lower = Math.floor(position)
    return values[lower] + (values[Math.ceil(position)] - values[lower]) * (position - lower)
  }
  const q1 = values.length ? quantile(0.25) : 0
  const q3 = values.length ? quantile(0.75) : 0
  const iqr = q3 - q1
  const canFilter = values.length >= 5 && iqr > 0
  const kept = canFilter ? values.filter(value => value >= q1 - 1.5 * iqr && value <= q3 + 1.5 * iqr) : values
  return {
    count: values.length, average: mean(values), filteredAverage: mean(kept),
    keptCount: kept.length, excludedCount: values.length - kept.length, canFilter,
    distribution: RATING_OPTIONS.map(value => ({ value, count: values.filter(item => item === Number(value)).length })),
    method: 'IQR 1.5；至少 5 筆且 IQR > 0 才剔除，原始回答不變',
  }
}
