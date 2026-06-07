import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getProfitColor, formatKRW } from '../lib/tradeHelpers'

// ── 작은 유틸 ──────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

// ── 공통 카드 ──────────────────────────────────────────
function Card({ label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '12px', padding: '18px 20px',
    }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: color || '#1e293b' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

// ── 가로 막대 바 ────────────────────────────────────────
function Bar({ label, value, max, color, suffix = '%', count }) {
  const pct = max > 0 ? Math.abs(value) / max * 100 : 0
  const isNeg = value < 0
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
        <span style={{ color: '#475569', fontWeight: 500 }}>{label}
          {count !== undefined && (
            <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>({count}건)</span>
          )}
        </span>
        <span style={{ fontWeight: 700, color: isNeg ? '#dc2626' : color || '#2563eb' }}>
          {isNeg ? '' : (suffix === '%' && value > 0 ? '+' : '')}{typeof value === 'number' ? value.toFixed(2) : value}{suffix}
        </span>
      </div>
      <div style={{ background: '#f1f5f9', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%',
          background: isNeg ? '#dc2626' : color || '#2563eb',
          borderRadius: '6px', transition: 'width 0.4s',
        }} />
      </div>
    </div>
  )
}

// ── 월별 막대 (수익금) ──────────────────────────────────
function MonthBar({ month, value, maxAbs }) {
  const isPos = value >= 0
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      {/* 위쪽 (양수) */}
      <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end' }}>
        {isPos && (
          <div style={{
            width: '28px', height: `${pct * 0.8}px`, minHeight: value !== 0 ? '2px' : '0',
            background: '#2563eb', borderRadius: '4px 4px 0 0',
          }} />
        )}
      </div>
      {/* 기준선 */}
      <div style={{ width: '100%', height: '1px', background: '#e2e8f0' }} />
      {/* 아래쪽 (음수) */}
      <div style={{ height: '80px', display: 'flex', alignItems: 'flex-start' }}>
        {!isPos && (
          <div style={{
            width: '28px', height: `${pct * 0.8}px`, minHeight: value !== 0 ? '2px' : '0',
            background: '#dc2626', borderRadius: '0 0 4px 4px',
          }} />
        )}
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>
        {month}
      </div>
      <div style={{
        fontSize: '11px', fontWeight: 600, textAlign: 'center',
        color: isPos ? '#2563eb' : '#dc2626',
      }}>
        {value === 0 ? '-' : (isPos ? '+' : '') + Math.round(value / 10000) + '만'}
      </div>
    </div>
  )
}

// ── 섹션 래퍼 ───────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '12px', padding: '20px', marginBottom: '16px',
    }}>
      <h3 style={{
        fontSize: '14px', fontWeight: 700, color: '#64748b',
        marginBottom: '18px', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{title}</h3>
      {children}
    </div>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────
export default function Stats() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('trades').select('*').then(({ data }) => {
      setTrades(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>불러오는 중...</div>
  )

  // ── 완료된 거래만 분석 ──────────────────────────────
  const done = trades.filter(t => t.sell_price != null && t.profit_rate != null)

  if (done.length === 0) return (
    <div style={{
      textAlign: 'center', padding: '60px', background: '#fff',
      borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
      <p style={{ fontSize: '16px' }}>완료된 매매 기록이 없습니다.</p>
      <p style={{ fontSize: '13px', marginTop: '6px' }}>매도가를 입력한 거래가 생기면 통계가 표시됩니다.</p>
    </div>
  )

  // ── 기본 통계 ───────────────────────────────────────
  const wins = done.filter(t => t.profit_rate > 0)
  const losses = done.filter(t => t.profit_rate < 0)
  const winRate = (wins.length / done.length * 100).toFixed(1)
  const avgWin = wins.length ? avg(wins.map(t => t.profit_rate)).toFixed(2) : '0.00'
  const avgLoss = losses.length ? avg(losses.map(t => t.profit_rate)).toFixed(2) : '0.00'
  const totalProfit = done.reduce((s, t) => s + (t.profit_amount || 0), 0)
  const avgHolding = done.filter(t => t.holding_days != null).length
    ? avg(done.filter(t => t.holding_days != null).map(t => t.holding_days)).toFixed(1) : '-'

  // ── 손익비 ──────────────────────────────────────────
  const rr = (losses.length && wins.length)
    ? (Number(avgWin) / Math.abs(Number(avgLoss))).toFixed(2) : '-'

  // ── 섹터별 ──────────────────────────────────────────
  const sectorMap = {}
  done.forEach(t => {
    if (!t.sector) return
    if (!sectorMap[t.sector]) sectorMap[t.sector] = []
    sectorMap[t.sector].push(t.profit_rate)
  })
  const sectorStats = Object.entries(sectorMap)
    .map(([s, rates]) => ({
      name: s,
      avgRate: avg(rates),
      count: rates.length,
      winRate: (rates.filter(r => r > 0).length / rates.length * 100).toFixed(0),
    }))
    .sort((a, b) => b.avgRate - a.avgRate)
  const maxSector = Math.max(...sectorStats.map(s => Math.abs(s.avgRate)), 0.01)

  // ── 매매방식별 ──────────────────────────────────────
  const styleMap = {}
  done.forEach(t => {
    if (!t.trade_style) return
    if (!styleMap[t.trade_style]) styleMap[t.trade_style] = []
    styleMap[t.trade_style].push(t.profit_rate)
  })
  const styleStats = Object.entries(styleMap)
    .map(([s, rates]) => ({
      name: s,
      winRate: rates.filter(r => r > 0).length / rates.length * 100,
      count: rates.length,
      avgRate: avg(rates),
    }))
    .sort((a, b) => b.winRate - a.winRate)
  const maxStyle = Math.max(...styleStats.map(s => s.winRate), 0.01)

  // ── 월별 손익 ────────────────────────────────────────
  const monthMap = {}
  done.forEach(t => {
    if (!t.sell_date) return
    const key = t.sell_date.slice(0, 7)   // "2024-03"
    if (!monthMap[key]) monthMap[key] = 0
    monthMap[key] += t.profit_amount || 0
  })
  const monthKeys = Object.keys(monthMap).sort()
  // 최근 12개월만
  const recentMonths = monthKeys.slice(-12)
  const maxMonthAbs = Math.max(...recentMonths.map(k => Math.abs(monthMap[k])), 1)

  // ── 감정 vs 수익률 ───────────────────────────────────
  const emotionMap = {}
  done.forEach(t => {
    if (!t.emotion_state) return
    if (!emotionMap[t.emotion_state]) emotionMap[t.emotion_state] = []
    emotionMap[t.emotion_state].push(t.profit_rate)
  })
  const emotionStats = Object.entries(emotionMap)
    .map(([e, rates]) => ({
      name: e,
      avgRate: avg(rates),
      count: rates.length,
      winRate: (rates.filter(r => r > 0).length / rates.length * 100).toFixed(0),
    }))
    .sort((a, b) => b.avgRate - a.avgRate)
  const maxEmotion = Math.max(...emotionStats.map(e => Math.abs(e.avgRate)), 0.01)

  // ── 매매등급별 ──────────────────────────────────────
  const gradeMap = {}
  done.forEach(t => {
    if (!t.trade_grade) return
    if (!gradeMap[t.trade_grade]) gradeMap[t.trade_grade] = []
    gradeMap[t.trade_grade].push(t.profit_rate)
  })
  const gradeOrder = ['A', 'B', 'C', 'D']
  const gradeColors2 = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' }
  const gradeStats = gradeOrder
    .filter(g => gradeMap[g])
    .map(g => ({
      name: g,
      avgRate: avg(gradeMap[g]),
      count: gradeMap[g].length,
      winRate: (gradeMap[g].filter(r => r > 0).length / gradeMap[g].length * 100).toFixed(0),
    }))
  const maxGrade = Math.max(...gradeStats.map(g => Math.abs(g.avgRate)), 0.01)

  // ── 최고/최악 거래 ───────────────────────────────────
  const bestTrade = [...done].sort((a, b) => b.profit_rate - a.profit_rate)[0]
  const worstTrade = [...done].sort((a, b) => a.profit_rate - b.profit_rate)[0]

  // ── 실수 유형 집계 ───────────────────────────────────
  const mistakeMap = {}
  done.forEach(t => {
    if (!t.mistake_types) return
    t.mistake_types.forEach(m => {
      mistakeMap[m] = (mistakeMap[m] || 0) + 1
    })
  })
  const mistakeStats = Object.entries(mistakeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const maxMistake = mistakeStats[0]?.[1] || 1

  // ────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '20px' }}>
        📊 통계 대시보드
      </h2>

      {/* ① 핵심 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <Card label="총 완료 거래" value={`${done.length}건`} sub={`전체 ${trades.length}건`} />
        <Card
          label="승률"
          value={`${winRate}%`}
          sub={`${wins.length}승 ${losses.length}패`}
          color={Number(winRate) >= 50 ? '#2563eb' : '#dc2626'}
        />
        <Card
          label="평균 수익률 (익)"
          value={`+${avgWin}%`}
          color="#2563eb"
        />
        <Card
          label="평균 수익률 (손)"
          value={`${avgLoss}%`}
          color="#dc2626"
        />
        <Card
          label="손익비"
          value={rr === '-' ? '-' : `${rr}`}
          sub="평균수익 ÷ 평균손실"
          color={rr !== '-' && Number(rr) >= 1 ? '#16a34a' : '#dc2626'}
        />
        <Card
          label="누적 손익"
          value={`${totalProfit >= 0 ? '+' : ''}${Math.round(totalProfit / 10000)}만원`}
          color={getProfitColor(totalProfit)}
        />
        <Card label="평균 보유기간" value={avgHolding === '-' ? '-' : `${avgHolding}일`} />
      </div>

      {/* ② 월별 손익 추이 */}
      {recentMonths.length > 0 && (
        <Section title="월별 손익 추이">
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
            {recentMonths.map(key => (
              <MonthBar
                key={key}
                month={key.slice(5)}   // "03"
                value={monthMap[key]}
                maxAbs={maxMonthAbs}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', color: '#94a3b8' }}>
            <span>■ <span style={{ color: '#2563eb' }}>수익</span></span>
            <span>■ <span style={{ color: '#dc2626' }}>손실</span></span>
            <span style={{ marginLeft: 'auto' }}>단위: 만원</span>
          </div>
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* ③ 섹터별 평균 수익률 */}
        {sectorStats.length > 0 && (
          <Section title="섹터별 평균 수익률">
            {sectorStats.map(s => (
              <Bar
                key={s.name}
                label={s.name}
                value={s.avgRate}
                max={maxSector}
                count={s.count}
                color="#7c3aed"
              />
            ))}
          </Section>
        )}

        {/* ④ 매매방식별 승률 */}
        {styleStats.length > 0 && (
          <Section title="매매방식별 승률">
            {styleStats.map(s => (
              <Bar
                key={s.name}
                label={s.name}
                value={s.winRate}
                max={maxStyle}
                count={s.count}
                suffix="%"
                color="#0891b2"
              />
            ))}
          </Section>
        )}

        {/* ⑤ 감정상태 vs 수익률 */}
        {emotionStats.length > 0 && (
          <Section title="감정상태별 평균 수익률">
            {emotionStats.map(e => (
              <Bar
                key={e.name}
                label={e.name}
                value={e.avgRate}
                max={maxEmotion}
                count={e.count}
                color="#d97706"
              />
            ))}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
              💡 수익률이 높은 감정 상태를 파악해 최적의 심리 조건을 만들어 보세요.
            </p>
          </Section>
        )}

        {/* ⑥ 매매등급별 평균 수익률 */}
        {gradeStats.length > 0 && (
          <Section title="매매등급별 평균 수익률">
            {gradeStats.map(g => (
              <Bar
                key={g.name}
                label={`등급 ${g.name}`}
                value={g.avgRate}
                max={maxGrade}
                count={g.count}
                color={gradeColors2[g.name]}
              />
            ))}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
              💡 등급은 계획 대비 실행 품질을 평가합니다. A등급 거래의 수익률이 낮다면 진입 기준을 점검해 보세요.
            </p>
          </Section>
        )}
      </div>

      {/* ⑦ 최고/최악 거래 */}
      <Section title="최고 / 최악 거래">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: '10px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, marginBottom: '8px' }}>
              🏆 최고 수익 거래
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{bestTrade.stock_name}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>
              +{bestTrade.profit_rate.toFixed(2)}%
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              +{formatKRW(bestTrade.profit_amount)}원 · {bestTrade.sell_date}
            </div>
          </div>
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '10px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>
              💀 최대 손실 거래
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{worstTrade.stock_name}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
              {worstTrade.profit_rate.toFixed(2)}%
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              {formatKRW(worstTrade.profit_amount)}원 · {worstTrade.sell_date}
            </div>
          </div>
        </div>
      </Section>

      {/* ⑧ 반복 실수 유형 */}
      {mistakeStats.length > 0 && (
        <Section title="반복 실수 유형">
          {mistakeStats.map(([name, count]) => (
            <Bar
              key={name}
              label={name}
              value={count}
              max={maxMistake}
              suffix="회"
              color="#dc2626"
            />
          ))}
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
            💡 가장 자주 반복되는 실수를 집중적으로 개선하면 수익률이 빠르게 올라갑니다.
          </p>
        </Section>
      )}
    </div>
  )
}