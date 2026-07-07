import { useState, useEffect, useMemo } from 'react'
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

// 증감률(YoY/MoM 공용) 표시 — 모듈 최상단 정의 (8-23 원칙)
function RateText({ rate, fontSize, fontWeight }) {
  if (rate == null) {
    return <span style={{ fontSize, color: '#cbd5e1' }}>-</span>
  }
  return (
    <span style={{ fontSize, fontWeight: fontWeight ?? 700, color: getProfitColor(rate), whiteSpace: 'nowrap' }}>
      {rate > 0 ? '▲' : rate < 0 ? '▼' : ''} {rate >= 0 ? '+' : ''}{rate.toFixed(1)}%
    </span>
  )
}

// 정렬 옵션 종류 — 모듈 최상단 정의
const SORT_OPTIONS = [
  { value: 'default', label: '기본(순위순)' },
  { value: 'amount', label: '수출액순' },
  { value: 'yoy', label: '증가율순(YoY)' },
]

export default function ExportTrend() {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [yymm, setYymm] = useState(null)
  const [sortOption, setSortOption] = useState('default')
  const [verifiedOnly, setVerifiedOnly] = useState(false)

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

      // EXPORT-PATCH 006 백필 이후 export_monthly에는 품목당 여러 달치 row가 존재함.
      // 화면에는 품목별로 가장 최근 yymm 1건만 표시 (mom_rate는 이미 그 최신 row에 계산되어 있음)
      const latestByItem = {}
      merged.forEach(r => {
        const existing = latestByItem[r.item_name]
        if (!existing || r.yymm > existing.yymm) latestByItem[r.item_name] = r
      })
      const latestRows = Object.values(latestByItem)
      latestRows.sort((a, b) => a.sort_order - b.sort_order)

      setRows(latestRows)
      if (latestRows.length > 0) {
        const maxYymm = latestRows.reduce((m, r) => (r.yymm > m ? r.yymm : m), latestRows[0].yymm)
        setYymm(maxYymm)
      }
    }
    setLoading(false)
  }

  // 정렬·필터 적용된 표시용 목록
  const displayRows = useMemo(() => {
    let list = rows
    if (verifiedOnly) {
      list = list.filter(r => r.verification_status === 'confirmed')
    }
    const sorted = [...list]
    if (sortOption === 'amount') {
      sorted.sort((a, b) => (Number(b.export_amount_usd) || 0) - (Number(a.export_amount_usd) || 0))
    } else if (sortOption === 'yoy') {
      sorted.sort((a, b) => {
        const av = a.yoy_rate != null ? Number(a.yoy_rate) : -Infinity
        const bv = b.yoy_rate != null ? Number(b.yoy_rate) : -Infinity
        return bv - av
      })
    } else {
      sorted.sort((a, b) => a.sort_order - b.sort_order)
    }
    return sorted
  }, [rows, sortOption, verifiedOnly])

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

  const controlSelectStyle = {
    padding: isMobile ? '8px 10px' : '7px 10px',
    fontSize: isMobile ? '14px' : '13px',
    border: '1.5px solid #d1d5db',
    borderRadius: '6px',
    background: '#ffffff',
    color: '#1e293b',
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

      {/* 정렬·필터 컨트롤 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '12px',
        flexWrap: 'wrap', marginBottom: '14px',
      }}>
        <select
          value={sortOption}
          onChange={e => setSortOption(e.target.value)}
          style={controlSelectStyle}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <label style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: isMobile ? '14px' : '13px', color: '#475569', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={e => setVerifiedOnly(e.target.checked)}
          />
          검증완료만 보기
        </label>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>불러오는 중...</div>
      ) : displayRows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px', background: '#fff',
          borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <p>{rows.length === 0 ? '등록된 수출 데이터가 없습니다.' : '조건에 맞는 품목이 없습니다.'}</p>
        </div>
      ) : isMobile ? (
        /* 모바일: 카드형 레이아웃 (가로 스크롤 없음) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {displayRows.map((row, idx) => {
            const badge = verificationBadge[row.verification_status] || verificationBadge.unverified
            const yoy = row.yoy_rate != null ? Number(row.yoy_rate) : null
            const mom = row.mom_rate != null ? Number(row.mom_rate) : null
            return (
              <div key={row.id} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{row.item_name}</span>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    background: badge.bg, color: badge.color,
                    border: `1px solid ${badge.border}`,
                    borderRadius: '4px',
                    fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{badge.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>
                      {row.stock_name ?? <span style={{ color: '#cbd5e1' }}>-</span>}
                    </div>
                    {row.weight_note && (
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>{row.weight_note}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
                      {formatBillionUsd(row.export_amount_usd)}
                    </div>
                    <div style={{ marginTop: '2px' }}>
                      <RateText rate={yoy} fontSize="14px" fontWeight={700} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      전월대비 <RateText rate={mom} fontSize="12px" fontWeight={600} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* PC: 표 레이아웃 */
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
                  <th style={{ ...thStyle, textAlign: 'right' }}>전월대비</th>
                  <th style={thStyle}>검증상태</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => {
                  const badge = verificationBadge[row.verification_status] || verificationBadge.unverified
                  const yoy = row.yoy_rate != null ? Number(row.yoy_rate) : null
                  const mom = row.mom_rate != null ? Number(row.mom_rate) : null
                  return (
                    <tr key={row.id}>
                      <td style={{ ...tdStyle, color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{row.item_name}</td>
                      <td style={tdStyle}>
                        {row.stock_name ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{row.stock_name}</div>
                            {row.weight_note && (
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
                        <RateText rate={yoy} fontSize="14px" fontWeight={700} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <RateText rate={mom} fontSize="14px" fontWeight={700} />
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px',
                          background: badge.bg, color: badge.color,
                          border: `1px solid ${badge.border}`,
                          borderRadius: '4px',
                          fontSize: '12px',
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