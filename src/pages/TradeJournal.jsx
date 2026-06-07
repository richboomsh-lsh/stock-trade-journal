import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatKRW, getProfitColor, gradeColors } from '../lib/tradeHelpers'

export default function TradeJournal() {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ sector: '', trade_style: '', trade_grade: '' })

  useEffect(() => { fetchTrades() }, [])

  const fetchTrades = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('trades').select('*').order('buy_date', { ascending: false })
    if (!error) setTrades(data || [])
    setLoading(false)
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
    return true
  })

  const completedTrades = trades.filter(t => t.sell_price)
  const wins = completedTrades.filter(t => t.profit_rate > 0)
  const winRate = completedTrades.length > 0
    ? (wins.length / completedTrades.length * 100).toFixed(0) : 0
  const avgProfit = completedTrades.length > 0
    ? (completedTrades.reduce((sum, t) => sum + (t.profit_rate || 0), 0) / completedTrades.length).toFixed(2) : 0

  const sel = {
    padding: '6px 10px', border: '1px solid #d1d5db',
    borderRadius: '6px', fontSize: '13px', background: '#fff', cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>📋 매매일지</h2>
        <Link to="/new" style={{
          padding: '8px 16px', background: '#2563eb', color: '#fff',
          textDecoration: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
        }}>+ 새 매매 입력</Link>
      </div>

      {completedTrades.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: '총 거래 수', value: `${trades.length}건` },
            { label: '완료 거래', value: `${completedTrades.length}건` },
            { label: '승률', value: `${winRate}%`, color: winRate >= 50 ? '#2563eb' : '#dc2626' },
            { label: '평균 수익률', value: `${avgProfit >= 0 ? '+' : ''}${avgProfit}%`, color: getProfitColor(Number(avgProfit)) },
          ].map(card => (
            <div key={card.label} style={{
              background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: '10px', padding: '14px 16px',
            }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{card.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: card.color || '#1e293b' }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select style={sel} value={filter.sector} onChange={e => setFilter({ ...filter, sector: e.target.value })}>
          <option value="">전체 섹터</option>
          {['에너지','반도체','바이오','금융','소비재','화학','철강','건설','운송','기타'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select style={sel} value={filter.trade_style} onChange={e => setFilter({ ...filter, trade_style: e.target.value })}>
          <option value="">전체 매매방식</option>
          {['눌림목','상한가따라잡기','돌파매수','역추세','스캘핑','기타'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select style={sel} value={filter.trade_grade} onChange={e => setFilter({ ...filter, trade_grade: e.target.value })}>
          <option value="">전체 등급</option>
          {['A','B','C','D'].map(g => <option key={g} value={g}>등급 {g}</option>)}
        </select>
        {(filter.sector || filter.trade_style || filter.trade_grade) && (
          <button onClick={() => setFilter({ sector: '', trade_style: '', trade_grade: '' })} style={{
            ...sel, background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626',
          }}>필터 초기화</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px', background: '#fff',
          borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p>매매 기록이 없습니다.</p>
          <Link to="/new" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '14px' }}>
            첫 매매를 기록해 보세요 →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(trade => (
            <Link key={trade.id} to={`/trade/${trade.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                  padding: '16px 18px', display: 'grid',
                  gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center',
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
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>
                      {trade.stock_name}
                    </span>
                    {trade.trade_grade && (
                      <span style={{
                        padding: '1px 7px',
                        background: gradeColors[trade.trade_grade] + '20',
                        color: gradeColors[trade.trade_grade],
                        borderRadius: '4px', fontSize: '12px', fontWeight: 700,
                        border: `1px solid ${gradeColors[trade.trade_grade]}40`,
                      }}>{trade.trade_grade}</span>
                    )}
                    {trade.sector && (
                      <span style={{
                        padding: '1px 7px', background: '#f1f5f9',
                        color: '#64748b', borderRadius: '4px', fontSize: '12px',
                      }}>{trade.sector}</span>
                    )}
                    {trade.trade_style && (
                      <span style={{
                        padding: '1px 7px', background: '#eff6ff',
                        color: '#2563eb', borderRadius: '4px', fontSize: '12px',
                      }}>{trade.trade_style}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#64748b', flexWrap: 'wrap' }}>
                    <span>매수 {trade.buy_date} · {formatKRW(trade.buy_price)}원</span>
                    {trade.sell_date && <span>매도 {trade.sell_date} · {formatKRW(trade.sell_price)}원</span>}
                    {trade.holding_days != null && <span>보유 {trade.holding_days}일</span>}
                    {trade.quantity && <span>{trade.quantity.toLocaleString()}주</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {trade.profit_rate != null ? (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: getProfitColor(trade.profit_rate) }}>
                        {trade.profit_rate >= 0 ? '+' : ''}{trade.profit_rate.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {trade.profit_amount >= 0 ? '+' : ''}{formatKRW(trade.profit_amount)}원
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>미완료</span>
                  )}
                  <button
                    onClick={(e) => deleteTrade(trade.id, e)}
                    style={{
                      padding: '5px 10px', background: '#fee2e2',
                      border: '1px solid #fca5a5', borderRadius: '6px',
                      cursor: 'pointer', color: '#dc2626', fontSize: '13px',
                    }}
                  >삭제</button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}