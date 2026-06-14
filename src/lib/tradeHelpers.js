import dayjs from 'dayjs'

export function calcProfitAmount(buyPrice, sellPrice, quantity) {
  if (!buyPrice || !sellPrice || !quantity) return 0
  return (sellPrice - buyPrice) * quantity
}

export function calcProfitRate(buyPrice, sellPrice) {
  if (!buyPrice || !sellPrice) return 0
  return ((sellPrice - buyPrice) / buyPrice) * 100
}

export function calcHoldingDays(buyDate, sellDate) {
  if (!buyDate || !sellDate) return 0
  return dayjs(sellDate).diff(dayjs(buyDate), 'day')
}

export function formatKRW(amount) {
  if (amount === null || amount === undefined) return '-'
  return Math.round(amount).toLocaleString('ko-KR')
}

export function getProfitColor(rate) {
  if (rate > 0) return '#dc2626'
  if (rate < 0) return '#2563eb'
  return '#6b7280'
}

export const gradeColors = {
  A: '#16a34a',
  B: '#2563eb',
  C: '#d97706',
  D: '#dc2626',
}