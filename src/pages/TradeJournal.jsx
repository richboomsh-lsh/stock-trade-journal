import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatKRW, getProfitColor, gradeColors } from '../lib/tradeHelpers'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function TradeJournal() {
  const isMobile = useIsMobile()
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ sector: '', trade_style: '', trade_grade: '', market: '' })
  const [opts, setOpts] = useState({ sector: [], trade_style: [] })

  useEffect(() => { fetchTrades(); fetchOptions() }, [])

  const fetchTrades = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('trades').select('*').order('buy_date', { ascending: false })
    if (!error) setTrades(data || [])
    setLoading(false)
  }

  const fetchOptions = async () => {
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('category, label')
      .in('category', ['sector', 'trade_style'])
      .order('sort_order', { ascending: true })
    if (!error && data) {
      const grouped = { sector: [], trade_style: [] }
      data.forEach(d => {
        if (grouped[d.category]) grouped[d.category].push(d.label)
      })
      setOpts(grouped)
    }
  }

  const deleteTrade = async (id, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm('이 매매 기록을 삭제하시겠습니까?')) return
    await supabase.from('trades').delete().eq('id', id)
    fetchTrades()
  }

  const filtered = trades.filter(t => {
    if (filter.sector && t.sector !== filter.sector) return false
    if (filter.trade_style && t.trade_style !== filter.trade_style) return false
    if (filter.trade_grade && t.trade_grade !== filter.trade_grade) return false
    if (filter.market && t.market !== filter.market) return false
    return true
  })

  const completedTrades = trades.filter(t => t.sell_price)
  const wins = completedTrades.filter(t => (t.net_profit_rate ?? t.profit_rate) > 0)
  const winRate = completedTrades.length > 0
    ? (wins.length / completedTrades.length * 100).toFixed(0) : 0
  const avgNetProfit = completedTrades.length > 0
    ? (completedTrades.reduce((sum, t) => sum + (t.net_profit_rate ?? t.profit_rate ?? 0), 0) / completedTrades.length).toFixed(2)
    : 0

  const sel = {
    padding: '7px 10px', border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: isMobile ? '16px' : '14px',
    background: '#fff',
    cursor: 'pointer', color: '#1e293b',
    flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
    minWidth: isMobile ? '0' : 'auto',
  }

  const hasFilter = filter.sector || filter.trade_style || filter.trade_grade || filter.market

  return (
    <div style={{ paddingBottom: isMobile ? '80px' : '0' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
          📋 매매일지
        </h2>
        <Link to="/new" style={{
          padding: isMobile ? '8px 14px' : '8px 16px',
          background: '#2563eb', color: '#fff',
          textDecoration: 'none', borderRadius: '8px',
          fontSize: isMobile ? '16px' : '15px', fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>+ 새 매매</Link>
      </div>

      {/* 통계 카드 */}
      {completedTrades.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: '10px', marginBottom: '16px',
        }}>
          {[
            { label: '총 거래', value: `${trades.length}건` },
            { label: '승률', value: `${winRate}%`, color: winRate > 0 ? '#dc2626' : '#6b7280' },
            { label: '평균 순수익률', value: `${avgNetProfit >= 0 ? '+' : ''}${avgNetProfit}%`, color: getProfitColor(Number(avgNetProfit)) },
            { label: '완료 거래', value: `${completedTrades.length}건` },
          ].map(card => (
            <div key={card.label} style={{
              background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: '10px', padding: '12px 14px',
            }}>
              <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginBottom: '4px' }}>{card.label}</div>
              <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: card.color || '#1e293b' }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 필터 */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <select style={sel} value={filter.market} onChange={e => setFilter({ ...filter, market: e.target.value })}>
          <option value="">전체 시장</option>
          <option value="코스피">코스피</option>
          <option value="코스닥">코스닥</option>
        </select>
        <select style={sel} value={filter.sector} onChange={e => setFilter({ ...filter, sector: e.target.value })}>
          <option value="">전체 섹터</option>
          {opts.sector.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select style={sel} value={filter.trade_style} onChange={e => setFilter({ ...filter, trade_style: e.target.value })}>
          <option value="">매매방식</option>
          {opts.trade_style.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select style={sel} value={filter.trade_grade} onChange={e => setFilter({ ...filter, trade_grade: e.target.value })}>
          <option value="">전체 등급</option>
          {['A','B','C','D'].map(g => <option key={g} value={g}>등급 {g}</option>)}
        </select>
        {hasFilter && (
          <button onClick={() => setFilter({ sector: '', trade_style: '', trade_grade: '', market: '' })} style={{
            ...sel,
            background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626',
            flex: isMobile ? '1 1 100%' : 'none',
          }}>✕ 필터 초기화</button>
        )}
      </div>

      {/* 목록 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px', background: '#fff',
          borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p>매매 기록이 없습니다.</p>
          <Link to="/new" style={{ color: '#2563eb', textDecoration: 'none', fontSize: isMobile ? '16px' : '14px' }}>
            첫 매매를 기록해 보세요 →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(trade => {
            const displayRate = trade.net_profit_rate ?? trade.profit_rate
            const displayAmount = trade.net_profit_amount ?? trade.profit_amount
            const soldQty = (trade.sell_splits || []).reduce((s, x) => s + (Number(x.quantity) || 0), 0)
            const remainingQty = trade.quantity != null ? trade.quantity - soldQty : null
            const isHolding = !trade.sell_price
            // ✅ 현재 매입금액 = 잔여 수량 × 평균 매수가 (8-22 패턴과 동일한 계산)
            const currentHoldingValue = (isHolding && remainingQty != null && trade.buy_price != null)
              ? remainingQty * trade.buy_price
              : null

            return (
              <Link key={trade.id} to={`/trade/${trade.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                    padding: isMobile ? '14px' : '16px 18px',
                    cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                    e.currentTarget.style.borderColor = '#93c5fd'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.borderColor = '#e2e8f0'
                  }}
                >
                  {/* 상단: 종목명 + 태그 + 순수익률 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b', whiteSpace: 'nowrap' }}>
                        {trade.stock_name}
                      </span>
                      {trade.market && (
                        <span style={{
                          padding: '1px 7px',
                          background: trade.market === '코스피' ? '#f0fdf4' : '#faf5ff',
                          color: trade.market === '코스피' ? '#16a34a' : '#7c3aed',
                          borderRadius: '4px',
                          fontSize: isMobile ? '14px' : '13px',
                          fontWeight: 600,
                          border: `1px solid ${trade.market === '코스피' ? '#bbf7d0' : '#e9d5ff'}`,
                          whiteSpace: 'nowrap',
                        }}>{trade.market}</span>
                      )}
                      {trade.trade_grade && (
                        <span style={{
                          padding: '1px 7px',
                          background: gradeColors[trade.trade_grade] + '20',
                          color: gradeColors[trade.trade_grade],
                          borderRadius: '4px',
                          fontSize: isMobile ? '16px' : '14px',
                          fontWeight: 700,
                          border: `1px solid ${gradeColors[trade.trade_grade]}40`,
                          whiteSpace: 'nowrap',
                        }}>{trade.trade_grade}</span>
                      )}
                      {trade.sector && (
                        <span style={{
                          padding: '1px 7px', background: '#f1f5f9',
                          color: '#64748b', borderRadius: '4px',
                          fontSize: isMobile ? '16px' : '14px',
                          whiteSpace: 'nowrap',
                        }}>{trade.sector}</span>
                      )}
                      {trade.trade_style && (
                        <span style={{
                          padding: '1px 7px', background: '#eff6ff',
                          color: '#2563eb', borderRadius: '4px',
                          fontSize: isMobile ? '16px' : '14px',
                          whiteSpace: 'nowrap',
                        }}>{trade.trade_style}</span>
                      )}
                    </div>

                    {displayRate != null ? (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: getProfitColor(displayRate) }}>
                          {displayRate >= 0 ? '+' : ''}{Number(displayRate).toFixed(2)}%
                        </div>
                        <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>
                          {displayAmount >= 0 ? '+' : ''}{formatKRW(displayAmount)}원
                        </div>
                        {trade.net_profit_rate != null && (
                          <div style={{ fontSize: '11px', color: '#cbd5e1' }}>순수익</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{
                          padding: '4px 10px',
                          background: '#fffbeb', color: '#d97706',
                          border: '1px solid #fde68a',
                          borderRadius: '14px', fontWeight: 700,
                          fontSize: isMobile ? '14px' : '13px',
                          whiteSpace: 'nowrap',
                        }}>
                          📌 보유 중{soldQty > 0 && remainingQty != null ? ` (잔여 ${remainingQty.toLocaleString()}주)` : ''}
                        </span>
                        {currentHoldingValue != null && (
                          <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#b45309', marginTop: '4px', whiteSpace: 'nowrap' }}>
                            매입금액 {formatKRW(currentHoldingValue)}원
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 하단: 날짜/가격 정보 + 삭제 버튼 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: '2px',
                      fontSize: isMobile ? '16px' : '14px', color: '#64748b',
                    }}>
                      <span>매수 {trade.buy_date} · {formatKRW(trade.buy_price)}원</span>
                      {trade.sell_date && (
                        <span>매도 {trade.sell_date} · {formatKRW(trade.sell_price)}원</span>
                      )}
                      <span style={{ color: '#94a3b8' }}>
                        {trade.holding_days != null ? `보유 ${trade.holding_days}일` : ''}
                        {trade.quantity ? ` · ${trade.quantity.toLocaleString()}주` : ''}
                      </span>
                    </div>
                    <button
                      onClick={(e) => deleteTrade(trade.id, e)}
                      style={{
                        padding: '5px 10px', background: '#fee2e2',
                        border: '1px solid #fca5a5', borderRadius: '6px',
                        cursor: 'pointer', color: '#dc2626',
                        fontSize: isMobile ? '16px' : '14px', flexShrink: 0,
                      }}
                    >삭제</button>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}