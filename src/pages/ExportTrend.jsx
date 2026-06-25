import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatKRW, getProfitColor } from '../lib/tradeHelpers'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// 검증상태 배지 색상/라벨 — 모듈 최상단 정의
const verificationBadge = {
  confirmed: { label: '검증완료', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  deferred: { label: '검증보류', bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  unverified: { label: '미검증', bg: '#f8fafc', color: '#6b7280', border: '#e2e8f0' },
}

// USD → 억 달러 변환 표시
function formatBillionUsd(amount) {
  if (amount == null) return '-'
  const eok = Number(amount) / 100_000_000
  return `${eok.toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}억 달러`
}

// yymm("202605") → "2026년 5월" 표시
function formatYymm(yymm) {
  if (!yymm || yymm.length !== 6) return ''
  const year = yymm.slice(0, 4)
  const month = parseInt(yymm.slice(4, 6), 10)
  return `${year}년 ${month}월`
}

export default function ExportTrend() {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [yymm, setYymm] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: exportData, error: exportErr }, { data: mappingData, error: mapErr }] = await Promise.all([
      supabase.from('export_monthly').select('*'),
      supabase.from('stock_item_mapping').select('*'),
    ])

    if (!exportErr && !mapErr && exportData) {
      const mapByItem = {}
      ;(mappingData || []).forEach(m => { mapByItem[m.item_name] = m })

      const merged = exportData.map(e => ({
        ...e,
        stock_name: mapByItem[e.item_name]?.stock_name ?? null,
        stock_code: mapByItem[e.item_name]?.stock_code ?? null,
        weight_note: mapByItem[e.item_name]?.weight_note ?? null,
        sort_order: mapByItem[e.item_name]?.sort_order ?? 999,
      }))

      merged.sort((a, b) => a.sort_order - b.sort_order)
      setRows(merged)
      if (merged.length > 0) setYymm(merged[0].yymm)
    }
    setLoading(false)
  }

  const deferredCount = rows.filter(r => r.verification_status === 'deferred').length
  const unverifiedCount = rows.filter(r => r.verification_status === 'unverified').length

  const thStyle = {
    textAlign: 'left',
    padding: isMobile ? '8px 6px' : '10px 12px',
    fontSize: isMobile ? '13px' : '13px',
    color: '#64748b',
    fontWeight: 600,
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap',
  }

  const tdStyle = {
    padding: isMobile ? '10px 6px' : '12px 12px',
    fontSize: isMobile ? '14px' : '14px',
    color: '#1e293b',
    borderBottom: '1px solid #f1f5f9',
    verticalAlign: 'middle',
  }

  return (
    <div style={{ paddingBottom: isMobile ? '80px' : '0' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>
          📦 수출입동향
        </h2>
        <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>
          {yymm ? `${formatYymm(yymm)} 기준 · 관세청 무역통계` : ''}
        </div>
      </div>

      {/* 검증상태 요약 안내 */}
      {(deferredCount > 0 || unverifiedCount > 0) && (
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: '8px', padding: '10px 14px',
          marginBottom: '16px',
          fontSize: isMobile ? '14px' : '13px', color: '#64748b',
        }}>
          ⚠️ HS코드 매핑 검증보류 {deferredCount}건 · 미검증 {unverifiedCount}건
          {' — 해당 품목 수치는 참고용으로만 활용하세요.'}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px', background: '#fff',
          borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p>등록된 수출 데이터가 없습니다.</p>
        </div>
      ) : (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '10px', overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '40px' }}>순위</th>
                  <th style={thStyle}>품목명</th>
                  <th style={thStyle}>대표종목</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>수출액</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>전년동월대비</th>
                  <th style={thStyle}>검증상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const badge = verificationBadge[row.verification_status] || verificationBadge.unverified
                  const rate = row.yoy_rate != null ? Number(row.yoy_rate) : null
                  return (
                    <tr key={row.id}>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{row.item_name}</td>
                      <td style={tdStyle}>
                        {row.stock_name ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{row.stock_name}</div>
                            {!isMobile && row.weight_note && (
                              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                                {row.weight_note}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>-</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {formatBillionUsd(row.export_amount_usd)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {rate != null ? (
                          <span style={{ fontWeight: 700, color: getProfitColor(rate) }}>
                            {rate > 0 ? '▲' : rate < 0 ? '▼' : ''} {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>-</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px',
                          background: badge.bg, color: badge.color,
                          border: `1px solid ${badge.border}`,
                          borderRadius: '4px',
                          fontSize: isMobile ? '13px' : '12px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}>{badge.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}