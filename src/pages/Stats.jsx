import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getProfitColor, formatKRW } from '../lib/tradeHelpers'

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

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

function MonthBar({ month, value, maxAbs }) {
  const isPos = value >= 0
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end' }}>
        {isPos && (
          <div style={{
            width: '28px', height: `${pct * 0.8}px`, minHeight: value !== 0 ? '2px' : '0',
            background: '#2563eb', borderRadius: '4px 4px 0 0',
          }} />
        )}
      </div>
      <div style={{ width: '100%', height: '1px', background: '#e2e8f0' }} />
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

  // ✅ 완료된 거래 — net_profit_rate 우선, 없으면 profit_rate fallback
  const done = trades.filter(t => t.sell_price != null && (t.net_profit_rate != null || t.profit_rate != null))

  const getRate = t => t.net_profit_rate ?? t.profit_rate ?? 0
  const getAmount = t => t.net_profit_amount ?? t.profit_amount ?? 0

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

  // ── 기본 통계 (순수익 기준) ─────────────────────────
  const wins = done.filter(t => getRate(t) > 0)
  const losses = done.filter(t => getRate(t) < 0)
  const winRate = (wins.length / done.length * 100).toFixed(1)
  const avgWin = wins.length ? avg(wins.map(t => getRate(t))).toFixed(2) : '0.00'
  const avgLoss = losses.length ? avg(losses.map(t => getRate(t))).toFixed(2) : '0.00'
  const totalProfit = done.reduce((s, t) => s + getAmount(t), 0)
  const avgHolding = done.filter(t => t.holding_days != null).length
    ? avg(done.filter(t => t.holding_days != null).map(t => t.holding_days)).toFixed(1) : '-'
  const rr = (losses.length && wins.length)
    ? (Number(avgWin) / Math.abs(Number(avgLoss))).toFixed(2) : '-'

  // ── 섹터별 (순수익 기준) ────────────────────────────
  const sectorMap = {}
  done.forEach(t => {
    if (!t.sector) return
    if (!sectorMap[t.sector]) sectorMap[t.sector] = []
    sectorMap[t.sector].push(getRate(t))
  })
  const sectorStats = Object.entries(sectorMap)
    .map(([s, rates]) => ({ name: s, avgRate: avg(rates), count: rates.length }))
    .sort((a, b) => b.avgRate - a.avgRate)
  const maxSector = Math.max(...sectorStats.map(s => Math.abs(s.avgRate)), 0.01)

  // ── 매매방식별 (순수익 기준) ────────────────────────
  const styleMap = {}
  done.forEach(t => {
    if (!t.trade_style) return
    if (!styleMap[t.trade_style]) styleMap[t.trade_style] = []
    styleMap[t.trade_style].push(getRate(t))
  })
  const styleStats = Object.entries(styleMap)
    .map(([s, rates]) => ({
      name: s,
      winRate: rates.filter(r => r > 0).length / rates.length * 100,
      count: rates.length,
    }))
    .sort((a, b) => b.winRate - a.winRate)
  const maxStyle = Math.max(...styleStats.map(s => s.winRate), 0.01)

  // ✅ 시장별 통계 (코스피/코스닥) ─────────────────────
  const marketMap = {}
  done.forEach(t => {
    if (!t.market) return
    if (!marketMap[t.market]) marketMap[t.market] = []
    marketMap[t.market].push(getRate(t))
  })
  const marketStats = Object.entries(marketMap)
    .map(([m, rates]) => ({
      name: m,
      winRate: rates.filter(r => r > 0).length / rates.length * 100,
      avgRate: avg(rates),
      count: rates.length,
    }))
    .sort((a, b) => b.avgRate - a.avgRate)
  const maxMarketRate = Math.max(...marketStats.map(s => Math.abs(s.avgRate)), 0.01)

  // ── 월별 손익 (순수익 기준) ─────────────────────────
  const monthMap = {}
  done.forEach(t => {
    if (!t.sell_date) return
    const key = t.sell_date.slice(0, 7)
    if (!monthMap[key]) monthMap[key] = 0
    monthMap[key] += getAmount(t)
  })
  const recentMonths = Object.keys(monthMap).sort().slice(-12)
  const maxMonthAbs = Math.max(...recentMonths.map(k => Math.abs(monthMap[k])), 1)

  // ✅ 감정상태 — emotion_before / emotion_after 분리 ──
  const buildEmotionStats = (field) => {
    const map = {}
    done.forEach(t => {
      const arr = t[field]
      if (!arr || !arr.length) return
      arr.forEach(e => {
        if (!map[e]) map[e] = []
        map[e].push(getRate(t))
      })
    })
    return Object.entries(map)
      .map(([e, rates]) => ({ name: e, avgRate: avg(rates), count: rates.length }))
      .sort((a, b) => b.avgRate - a.avgRate)
  }
  // 구버전 emotion_state도 fallback으로 지원
  const buildEmotionStatsFallback = () => {
    const map = {}
    done.forEach(t => {
      if (t.emotion_before?.length || t.emotion_after?.length) return // 신버전은 위에서 처리
      if (!t.emotion_state) return
      if (!map[t.emotion_state]) map[t.emotion_state] = []
      map[t.emotion_state].push(getRate(t))
    })
    return Object.entries(map)
      .map(([e, rates]) => ({ name: e, avgRate: avg(rates), count: rates.length }))
      .sort((a, b) => b.avgRate - a.avgRate)
  }
  const emotionBeforeStats = buildEmotionStats('emotion_before')
  const emotionAfterStats = buildEmotionStats('emotion_after')
  const emotionFallbackStats = buildEmotionStatsFallback()
  const allEmotionStats = [...emotionBeforeStats, ...emotionAfterStats, ...emotionFallbackStats]
  const maxEmotion = Math.max(...allEmotionStats.map(e => Math.abs(e.avgRate)), 0.01)

  // ── 매매등급별 (순수익 기준) ────────────────────────
  const gradeMap = {}
  done.forEach(t => {
    if (!t.trade_grade) return
    if (!gradeMap[t.trade_grade]) gradeMap[t.trade_grade] = []
    gradeMap[t.trade_grade].push(getRate(t))
  })
  const gradeOrder = ['A', 'B', 'C', 'D']
  const gradeColors2 = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' }
  const gradeStats = gradeOrder
    .filter(g => gradeMap[g])
    .map(g => ({
      name: g,
      avgRate: avg(gradeMap[g]),
      count: gradeMap[g].length,
    }))
  const maxGrade = Math.max(...gradeStats.map(g => Math.abs(g.avgRate)), 0.01)

  // ── 최고/최악 거래 (순수익 기준) ───────────────────
  const bestTrade = [...done].sort((a, b) => getRate(b) - getRate(a))[0]
  const worstTrade = [...done].sort((a, b) => getRate(a) - getRate(b))[0]

  // ✅ 실수유형 — mistake_buy / mistake_sell 분리 ──────
  const buildMistakeStats = (field) => {
    const map = {}
    done.forEach(t => {
      const arr = t[field]
      if (!arr || !arr.length) return
      arr.forEach(m => { map[m] = (map[m] || 0) + 1 })
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }
  // 구버전 mistake_types fallback
  const mistakeFallback = (() => {
    const map = {}
    done.forEach(t => {
      if (t.mistake_buy?.length || t.mistake_sell?.length) return
      if (!t.mistake_types) return
      t.mistake_types.forEach(m => { map[m] = (map[m] || 0) + 1 })
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  })()
  const mistakeBuyStats = buildMistakeStats('mistake_buy')
  const mistakeSellStats = buildMistakeStats('mistake_sell')
  const maxMistakeBuy = mistakeBuyStats[0]?.[1] || 1
  const maxMistakeSell = mistakeSellStats[0]?.[1] || 1
  const maxMistakeFallback = mistakeFallback[0]?.[1] || 1

  // ────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '20px' }}>
        📊 통계 대시보드
      </h2>

      {/* ① 핵심 요약 카드 (순수익 기준) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <Card label="총 완료 거래" value={`${done.length}건`} sub={`전체 ${trades.length}건`} />
        <Card
          label="승률"
          value={`${winRate}%`}
          sub={`${wins.length}승 ${losses.length}패`}
          color={Number(winRate) >= 50 ? '#2563eb' : '#dc2626'}
        />
        <Card label="평균 순수익률 (익)" value={`+${avgWin}%`} color="#2563eb" />
        <Card label="평균 순수익률 (손)" value={`${avgLoss}%`} color="#dc2626" />
        <Card
          label="손익비"
          value={rr === '-' ? '-' : `${rr}`}
          sub="평균수익 ÷ 평균손실"
          color={rr !== '-' && Number(rr) >= 1 ? '#16a34a' : '#dc2626'}
        />
        <Card
          label="누적 순손익"
          value={`${totalProfit >= 0 ? '+' : ''}${Math.round(totalProfit / 10000)}만원`}
          color={getProfitColor(totalProfit)}
        />
        <Card label="평균 보유기간" value={avgHolding === '-' ? '-' : `${avgHolding}일`} />
      </div>

      {/* ② 월별 손익 추이 */}
      {recentMonths.length > 0 && (
        <Section title="월별 순손익 추이">
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}>
            {recentMonths.map(key => (
              <MonthBar key={key} month={key.slice(5)} value={monthMap[key]} maxAbs={maxMonthAbs} />
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

        {/* ③ 섹터별 평균 순수익률 */}
        {sectorStats.length > 0 && (
          <Section title="섹터별 평균 순수익률">
            {sectorStats.map(s => (
              <Bar key={s.name} label={s.name} value={s.avgRate} max={maxSector} count={s.count} color="#7c3aed" />
            ))}
          </Section>
        )}

        {/* ④ 매매방식별 승률 */}
        {styleStats.length > 0 && (
          <Section title="매매방식별 승률">
            {styleStats.map(s => (
              <Bar key={s.name} label={s.name} value={s.winRate} max={maxStyle} count={s.count} suffix="%" color="#0891b2" />
            ))}
          </Section>
        )}

        {/* ✅ ⑤ 시장별 통계 */}
        {marketStats.length > 0 && (
          <Section title="시장별 평균 순수익률">
            {marketStats.map(m => (
              <Bar
                key={m.name}
                label={m.name}
                value={m.avgRate}
                max={maxMarketRate}
                count={m.count}
                color={m.name === '코스피' ? '#16a34a' : '#7c3aed'}
              />
            ))}
            <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>승률</div>
              {marketStats.map(m => (
                <Bar
                  key={m.name + '_wr'}
                  label={m.name}
                  value={m.winRate}
                  max={100}
                  count={m.count}
                  suffix="%"
                  color={m.name === '코스피' ? '#16a34a' : '#7c3aed'}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ✅ ⑥ 감정상태별 — 매수 전 */}
        {emotionBeforeStats.length > 0 && (
          <Section title="매수 전 감정별 평균 순수익률">
            {emotionBeforeStats.map(e => (
              <Bar key={e.name} label={e.name} value={e.avgRate} max={maxEmotion} count={e.count} color="#d97706" />
            ))}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
              💡 매수 전 어떤 심리 상태일 때 좋은 결과가 나오는지 파악해 보세요.
            </p>
          </Section>
        )}

        {/* ✅ ⑦ 감정상태별 — 매수 후 */}
        {emotionAfterStats.length > 0 && (
          <Section title="매수 후 감정별 평균 순수익률">
            {emotionAfterStats.map(e => (
              <Bar key={e.name} label={e.name} value={e.avgRate} max={maxEmotion} count={e.count} color="#0891b2" />
            ))}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
              💡 매수 후 감정이 매도 결정에 미치는 영향을 분석해 보세요.
            </p>
          </Section>
        )}

        {/* 구버전 감정상태 fallback */}
        {emotionFallbackStats.length > 0 && (
          <Section title="감정상태별 평균 순수익률">
            {emotionFallbackStats.map(e => (
              <Bar key={e.name} label={e.name} value={e.avgRate} max={maxEmotion} count={e.count} color="#d97706" />
            ))}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
              💡 수익률이 높은 감정 상태를 파악해 최적의 심리 조건을 만들어 보세요.
            </p>
          </Section>
        )}

        {/* ⑧ 매매등급별 평균 순수익률 */}
        {gradeStats.length > 0 && (
          <Section title="매매등급별 평균 순수익률">
            {gradeStats.map(g => (
              <Bar key={g.name} label={`등급 ${g.name}`} value={g.avgRate} max={maxGrade} count={g.count} color={gradeColors2[g.name]} />
            ))}
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
              💡 등급은 계획 대비 실행 품질을 평가합니다. A등급 거래의 수익률이 낮다면 진입 기준을 점검해 보세요.
            </p>
          </Section>
        )}
      </div>

      {/* ⑨ 최고/최악 거래 (순수익 기준) */}
      <Section title="최고 / 최악 거래">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: '10px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, marginBottom: '8px' }}>🏆 최고 수익 거래</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{bestTrade.stock_name}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>
              +{getRate(bestTrade).toFixed(2)}%
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              +{formatKRW(getAmount(bestTrade))}원 · {bestTrade.sell_date}
            </div>
            {bestTrade.net_profit_rate != null && (
              <div style={{ fontSize: '11px', color: '#93c5fd', marginTop: '2px' }}>순수익 기준</div>
            )}
          </div>
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '10px', padding: '16px',
          }}>
            <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '8px' }}>💀 최대 손실 거래</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{worstTrade.stock_name}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
              {getRate(worstTrade).toFixed(2)}%
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              {formatKRW(getAmount(worstTrade))}원 · {worstTrade.sell_date}
            </div>
            {worstTrade.net_profit_rate != null && (
              <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>순수익 기준</div>
            )}
          </div>
        </div>
      </Section>

      {/* ✅ ⑩ 실수유형 — 매수 실수 */}
      {mistakeBuyStats.length > 0 && (
        <Section title="반복 실수 유형 — 매수">
          {mistakeBuyStats.map(([name, count]) => (
            <Bar key={name} label={name} value={count} max={maxMistakeBuy} suffix="회" color="#f59e0b" />
          ))}
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
            💡 매수 단계의 반복 실수를 줄이면 진입 품질이 올라갑니다.
          </p>
        </Section>
      )}

      {/* ✅ ⑪ 실수유형 — 매도 실수 */}
      {mistakeSellStats.length > 0 && (
        <Section title="반복 실수 유형 — 매도">
          {mistakeSellStats.map(([name, count]) => (
            <Bar key={name} label={name} value={count} max={maxMistakeSell} suffix="회" color="#dc2626" />
          ))}
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
            💡 매도 단계의 반복 실수를 개선하면 수익 실현율이 높아집니다.
          </p>
        </Section>
      )}

      {/* 구버전 실수유형 fallback */}
      {mistakeFallback.length > 0 && (
        <Section title="반복 실수 유형">
          {mistakeFallback.map(([name, count]) => (
            <Bar key={name} label={name} value={count} max={maxMistakeFallback} suffix="회" color="#dc2626" />
          ))}
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', lineHeight: '1.6' }}>
            💡 가장 자주 반복되는 실수를 집중적으로 개선하면 수익률이 빠르게 올라갑니다.
          </p>
        </Section>
      )}
    </div>
  )
}