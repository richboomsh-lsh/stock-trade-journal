import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// 수익률 색상 (한국 주식 기준)
function getProfitColor(rate) {
  if (rate > 0) return '#dc2626'
  if (rate < 0) return '#2563eb'
  return '#6b7280'
}

// 숫자 천단위 콤마
function comma(n) {
  if (n == null) return '-'
  return Number(n).toLocaleString()
}

// 배열 무작위 섞기
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 태그 컴포넌트
function Tag({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: 500,
      color,
      background: bg,
      marginRight: '6px',
      marginBottom: '6px',
    }}>
      {label}
    </span>
  )
}

// 정보 행 컴포넌트
function InfoRow({ label, value, valueStyle }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid #f1f5f9',
    }}>
      <span style={{ fontSize: '14px', color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', ...valueStyle }}>{value}</span>
    </div>
  )
}

// 서술 필드 컴포넌트
function TextField({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px', color: '#1e293b', lineHeight: '1.7',
        background: '#f8fafc', borderRadius: '8px',
        padding: '12px', whiteSpace: 'pre-wrap', textAlign: 'left',
      }}>
        {value}
      </div>
    </div>
  )
}

export default function ReviewSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const { filter, style } = location.state || { filter: 'random', style: null }

  const [trades, setTrades] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [step, setStep] = useState(1)       // 1: 기본정보, 2: 결과공개, 3: 전체공개
  const [loading, setLoading] = useState(true)
  const [imgModal, setImgModal] = useState(null) // 이미지 확대 모달
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // 거래 데이터 불러오기
  useEffect(() => {
    async function fetchTrades() {
      setLoading(true)
      let query = supabase
        .from('trades')
        .select('*')
        .not('sell_price', 'is', null)  // 완료된 거래만

      if (filter === 'loss') {
        query = query.lt('net_profit_amount', 0)
      } else if (filter === 'profit') {
        query = query.gt('net_profit_amount', 0)
      } else if (filter === 'style' && style) {
        query = query.eq('trade_style', style)
      }

      const { data, error } = await query

      if (error) {
        alert('데이터를 불러오는 중 오류가 발생했습니다.')
        navigate('/review')
        return
      }

      if (!data || data.length === 0) {
        alert('해당 조건에 맞는 완료된 거래가 없습니다.')
        navigate('/review')
        return
      }

      setTrades(shuffle(data))
      setLoading(false)
    }
    fetchTrades()
  }, [filter, style])

  const trade = trades[currentIndex]

  // 순수익 우선, 없으면 기존값 fallback
  const displayRate = trade?.net_profit_rate ?? trade?.profit_rate ?? 0
  const displayAmount = trade?.net_profit_amount ?? trade?.profit_amount ?? 0
  const isNetProfit = trade?.net_profit_rate != null

  function goNext() {
    if (currentIndex < trades.length - 1) {
      setCurrentIndex(i => i + 1)
      setStep(1)
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1)
      setStep(1)
    }
  }

  function handleEnd() {
    navigate('/review')
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '80px', color: '#64748b' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <div>거래 데이터를 불러오는 중...</div>
      </div>
    )
  }

  if (!trade) return null

  const filterLabel = {
    random: '🎲 랜덤 복기',
    loss: '📉 손실 복기',
    profit: '📈 수익 복기',
    style: `🎯 ${style}`,
  }[filter]

  // 차트 이미지 경로 → 공개 URL 변환
  function getImgUrl(path) {
    if (!path) return ''
    if (path.startsWith('http')) return path
    const { data } = supabase.storage.from('chart-images').getPublicUrl(path)
    return data?.publicUrl || ''
  }

  const images = (trade.chart_images || []).map(getImgUrl).filter(Boolean)

  // 감정·실수 배열 (구버전 fallback 포함)
  const emotionBefore = trade.emotion_before?.length > 0 ? trade.emotion_before : []
  const emotionAfter = trade.emotion_after?.length > 0
    ? trade.emotion_after
    : trade.emotion_state ? [trade.emotion_state] : []
  const mistakeBuy = trade.mistake_buy?.length > 0 ? trade.mistake_buy : []
  const mistakeSell = trade.mistake_sell?.length > 0
    ? trade.mistake_sell
    : trade.mistake_types || []

  // ── 섹션 스타일 ──
  const sectionStyle = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '12px',
  }

  const revealBtnStyle = (color) => ({
    width: '100%',
    padding: '13px',
    borderRadius: '10px',
    border: `2px dashed ${color}`,
    background: '#f8fafc',
    color: color,
    fontSize: isMobile ? '15px' : '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '12px',
  })

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', paddingBottom: '40px' }}>

      {/* ── 상단 헤더 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '20px',
        paddingBottom: '14px',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '2px' }}>{filterLabel}</div>
          <div style={{ fontSize: isMobile ? '16px' : '15px', fontWeight: 700, color: '#1e293b' }}>
            {currentIndex + 1} / {trades.length}번째 매매
          </div>
        </div>
        <button
          onClick={handleEnd}
          style={{
            background: '#f1f5f9', border: 'none',
            borderRadius: '8px', padding: '8px 14px',
            fontSize: '13px', color: '#64748b',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          복기 종료
        </button>
      </div>

      {/* ── STEP 1: 기본 정보 (항상 공개) ── */}
      <div style={sectionStyle}>
        {/* 종목명 + 시장 배지 */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: 700, color: '#1e293b' }}>
              {trade.stock_name}
            </span>
            {trade.market && (
              <span style={{
                fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                background: trade.market === '코스피' ? '#f0fdf4' : '#faf5ff',
                color: trade.market === '코스피' ? '#16a34a' : '#7c3aed',
                border: `1px solid ${trade.market === '코스피' ? '#bbf7d0' : '#e9d5ff'}`,
              }}>
                {trade.market}
              </span>
            )}
          </div>
        </div>

        <InfoRow label="매수일" value={trade.buy_date} />
        <InfoRow label="매수가" value={`${comma(trade.buy_price)}원`} />
        <InfoRow label="수량" value={`${comma(trade.quantity)}주`} />
        {trade.position_size != null && (
          <InfoRow label="포지션 비중" value={`${trade.position_size}%`} />
        )}
        {trade.sector && <InfoRow label="섹터" value={trade.sector} />}
        {trade.trade_style && <InfoRow label="매매방식" value={trade.trade_style} />}
        {trade.market_condition && <InfoRow label="시장상황" value={trade.market_condition} />}

        {/* 테마 태그 */}
        {trade.themes?.length > 0 && (
          <div style={{ paddingTop: '10px' }}>
            {trade.themes.map(t => (
              <Tag key={t} label={t} color='#7c3aed' bg='#faf5ff' />
            ))}
          </div>
        )}
      </div>

      {/* 차트 이미지 (항상 공개) */}
      {images.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '10px' }}>
            차트 이미지
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: '8px',
          }}>
            {images.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`차트 ${i + 1}`}
                onClick={() => setImgModal(url)}
                style={{
                  width: '100%', borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer', objectFit: 'cover',
                  maxHeight: '240px',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: 결과 공개 버튼 or 결과 내용 ── */}
      {step < 2 ? (
        <button style={revealBtnStyle('#2563eb')} onClick={() => setStep(2)}>
          📊 결과 보기 (매도가 · 수익률 공개)
        </button>
      ) : (
        <div style={{ ...sectionStyle, border: '1.5px solid #bfdbfe', background: '#eff6ff' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', marginBottom: '12px' }}>
            📊 매매 결과
          </div>
          <InfoRow label="매도일" value={trade.sell_date || '-'} />
          <InfoRow label="매도가" value={`${comma(trade.sell_price)}원`} />
          <InfoRow label="보유기간" value={`${trade.holding_days ?? '-'}일`} />

          {/* 수익률 크게 표시 */}
          <div style={{
            textAlign: 'center', padding: '16px 0 8px',
            borderTop: '1px solid #dbeafe', marginTop: '8px',
          }}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
              {isNetProfit ? '순수익률' : '수익률'}
            </div>
            <div style={{
              fontSize: '32px', fontWeight: 800,
              color: getProfitColor(displayRate),
            }}>
              {displayRate > 0 ? '+' : ''}{Number(displayRate).toFixed(2)}%
            </div>
            <div style={{
              fontSize: '16px', fontWeight: 600,
              color: getProfitColor(displayAmount),
              marginTop: '4px',
            }}>
              {displayAmount > 0 ? '+' : ''}{comma(Math.round(displayAmount))}원
            </div>
            {isNetProfit && trade.fee != null && (
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                수수료·세금 {comma(Math.round((trade.fee || 0) + (trade.tax || 0)))}원 포함
              </div>
            )}
          </div>

          {trade.trade_grade && (
            <div style={{ textAlign: 'center', paddingTop: '8px' }}>
              {(() => {
                const gradeColor = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' }
                const c = gradeColor[trade.trade_grade] || '#6b7280'
                return (
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 16px', borderRadius: '20px',
                    background: c + '18', color: c,
                    fontWeight: 700, fontSize: '14px',
                    border: `1px solid ${c}40`,
                  }}>
                    매매등급 {trade.trade_grade}
                  </span>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: 당시 기록 공개 버튼 or 기록 내용 ── */}
      {step === 2 && (
        <button style={revealBtnStyle('#7c3aed')} onClick={() => setStep(3)}>
          📝 당시 기록 보기 (진입근거 · 감정 · 성찰 공개)
        </button>
      )}

      {step >= 3 && (
        <div style={{ ...sectionStyle, border: '1.5px solid #e9d5ff', background: '#faf5ff' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#7c3aed', marginBottom: '14px' }}>
            📝 당시 기록
          </div>

          {/* 감정 태그 */}
          {(emotionBefore.length > 0 || emotionAfter.length > 0) && (
            <div style={{ marginBottom: '14px' }}>
              {emotionBefore.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', marginRight: '8px' }}>매수 전 감정</span>
                  {emotionBefore.map(e => <Tag key={e} label={e} color='#92400e' bg='#fef3c7' />)}
                </div>
              )}
              {emotionAfter.length > 0 && (
                <div>
                  <span style={{ fontSize: '12px', color: '#64748b', marginRight: '8px' }}>매도 후 감정</span>
                  {emotionAfter.map(e => <Tag key={e} label={e} color='#6d28d9' bg='#ede9fe' />)}
                </div>
              )}
            </div>
          )}

          {/* 실수 태그 */}
          {(mistakeBuy.length > 0 || mistakeSell.length > 0) && (
            <div style={{ marginBottom: '14px' }}>
              {mistakeBuy.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', marginRight: '8px' }}>매수 실수</span>
                  {mistakeBuy.map(m => <Tag key={m} label={m} color='#dc2626' bg='#fef2f2' />)}
                </div>
              )}
              {mistakeSell.length > 0 && (
                <div>
                  <span style={{ fontSize: '12px', color: '#64748b', marginRight: '8px' }}>매도 실수</span>
                  {mistakeSell.map(m => <Tag key={m} label={m} color='#ea580c' bg='#fff7ed' />)}
                </div>
              )}
            </div>
          )}

          {/* 서술 필드 */}
          <TextField label="재료 및 시장상황" value={trade.material_context} />
          <TextField label="진입근거" value={trade.entry_reason} />
          <TextField label="손절선 사전 설정" value={trade.stop_loss_plan} />
          <TextField label="대응 기록" value={trade.trade_log} />
          {trade.sell_reason && (
            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>매도이유 </span>
              <Tag label={trade.sell_reason} color='#374151' bg='#f1f5f9' />
            </div>
          )}

          {/* 성찰 */}
          {(trade.reflection_good || trade.reflection_bad || trade.reflection_next) && (
            <div style={{
              background: '#fff', border: '1px solid #e9d5ff',
              borderRadius: '8px', padding: '12px', marginTop: '4px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#7c3aed', marginBottom: '10px' }}>
                성찰
              </div>
              <TextField label="✅ 잘한 점" value={trade.reflection_good} />
              <TextField label="💧 아쉬운 점" value={trade.reflection_bad} />
              <TextField label="🎯 다음에는" value={trade.reflection_next} />
            </div>
          )}
        </div>
      )}

      {/* ── 하단 네비게이션 ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '20px', gap: '12px',
      }}>
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          style={{
            flex: 1, padding: '14px',
            borderRadius: '10px', border: '1.5px solid #e2e8f0',
            background: currentIndex === 0 ? '#f8fafc' : '#fff',
            color: currentIndex === 0 ? '#cbd5e1' : '#1e293b',
            fontSize: isMobile ? '15px' : '14px',
            fontWeight: 600, cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ◀ 이전
        </button>

        {/* 진행 점 인디케이터 */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {trades.slice(
            Math.max(0, currentIndex - 2),
            Math.min(trades.length, currentIndex + 3)
          ).map((_, i) => {
            const realIdx = Math.max(0, currentIndex - 2) + i
            return (
              <div key={realIdx} style={{
                width: realIdx === currentIndex ? '10px' : '6px',
                height: realIdx === currentIndex ? '10px' : '6px',
                borderRadius: '50%',
                background: realIdx === currentIndex ? '#2563eb' : '#cbd5e1',
                transition: 'all 0.2s',
              }} />
            )
          })}
        </div>

        {currentIndex < trades.length - 1 ? (
          <button
            onClick={goNext}
            style={{
              flex: 1, padding: '14px',
              borderRadius: '10px', border: 'none',
              background: '#2563eb', color: '#fff',
              fontSize: isMobile ? '15px' : '14px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            다음 ▶
          </button>
        ) : (
          <button
            onClick={handleEnd}
            style={{
              flex: 1, padding: '14px',
              borderRadius: '10px', border: 'none',
              background: '#16a34a', color: '#fff',
              fontSize: isMobile ? '15px' : '14px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            복기 완료 ✓
          </button>
        )}
      </div>

      {/* ── 이미지 확대 모달 ── */}
      {imgModal && (
        <div
          onClick={() => setImgModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '16px',
          }}
        >
          <img
            src={imgModal}
            alt="차트 확대"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' }}
          />
          <button
            onClick={() => setImgModal(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: '20px', width: '36px', height: '36px',
              borderRadius: '50%', cursor: 'pointer',
            }}
          >✕</button>
        </div>
      )}

    </div>
  )
}