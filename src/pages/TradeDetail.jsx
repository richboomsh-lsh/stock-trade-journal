import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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

/* ───────────── 마크다운 렌더링 ───────────── */
function parseInline(text, keyPrefix) {
  const pattern = /(\*\*(.+?)\*\*|==(?:(red|blue|green):)?(.+?)==)/g
  const parts = []
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[0].startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b-${match.index}`} style={{ fontWeight: 700 }}>
          {match[2]}
        </strong>
      )
    } else {
      const colorKey = match[3]
      const content  = match[4]
      const styles = {
        red:   { bg: '#fee2e2', fg: '#dc2626' },
        blue:  { bg: '#dbeafe', fg: '#2563eb' },
        green: { bg: '#dcfce7', fg: '#16a34a' },
      }
      const s = colorKey ? styles[colorKey] : { bg: '#ffedd5', fg: '#ea580c' }
      parts.push(
        <mark key={`${keyPrefix}-m-${match.index}`} style={{
          background: s.bg, color: s.fg,
          borderRadius: '3px', padding: '0 3px',
        }}>{content}</mark>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderMarkdown(text) {
  if (!text) return null
  return text.split('\n').map((line, i, arr) => (
    <span key={i}>
      {parseInline(line, String(i))}
      {i < arr.length - 1 && <br />}
    </span>
  ))
}
/* ─────────────────────────────────────────── */

function Field({ label, value, color, isMobile, markdown }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: isMobile ? '14px' : '14px', color: '#94a3b8', marginBottom: '3px' }}>{label}</div>
      <div style={{
        fontSize: isMobile ? '16px' : '14px',
        color: color || '#1e293b',
        lineHeight: '1.6',
        textAlign: 'left',
        whiteSpace: markdown ? 'normal' : 'pre-wrap',
      }}>
        {markdown ? renderMarkdown(value) : value}
      </div>
    </div>
  )
}

function TagList({ label, items, color, isMobile }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginBottom: '6px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {items.map((item, i) => (
          <span key={i} style={{
            padding: '2px 10px',
            background: color ? color + '15' : '#f1f5f9',
            color: color || '#475569',
            borderRadius: '20px', fontSize: isMobile ? '16px' : '14px',
            border: `1px solid ${color ? color + '40' : '#e2e8f0'}`,
          }}>{item}</span>
        ))}
      </div>
    </div>
  )
}

function Section({ title, children, isMobile }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
      padding: '16px', marginBottom: '12px',
    }}>
      <h3 style={{
        fontSize: isMobile ? '16px' : '14px', fontWeight: 700, color: '#64748b', marginBottom: '14px',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{title}</h3>
      {children}
    </div>
  )
}

export default function TradeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [trade, setTrade] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageUrls, setImageUrls] = useState([])

  const [modalIndex, setModalIndex] = useState(null)
  const modalRef = useRef(null)
  const imgRef   = useRef(null)

  const ms = useRef({
    scale: 1, panX: 0, panY: 0,
    startX: 0, startY: 0,
    panStartX: 0, panStartY: 0,
    pinchDist: null,
    pinchScale: 1,
    lastTap: 0,
    moving: false,
  })

  useEffect(() => { fetchTrade() }, [id])

  const fetchTrade = async () => {
    const { data, error } = await supabase
      .from('trades').select('*').eq('id', id).single()
    if (error || !data) {
      alert('매매 기록을 찾을 수 없습니다.')
      navigate('/journal')
      return
    }
    setTrade(data)
    if (data.chart_images && data.chart_images.length > 0) {
      const urls = data.chart_images.map((path) => {
        const { data: urlData } = supabase.storage
          .from('chart-images').getPublicUrl(path)
        return urlData.publicUrl
      })
      setImageUrls(urls)
    }
    setLoading(false)
  }

  const deleteTrade = async () => {
    if (!window.confirm('이 매매 기록을 삭제하시겠습니까?')) return
    if (trade.chart_images && trade.chart_images.length > 0) {
      await supabase.storage.from('chart-images').remove(trade.chart_images)
    }
    await supabase.from('trades').delete().eq('id', id)
    navigate('/journal')
  }

  const applyTransform = () => {
    if (!imgRef.current) return
    const { scale: s, panX, panY } = ms.current
    imgRef.current.style.transform = s <= 1
      ? 'none'
      : `scale(${s}) translate(${panX / s}px, ${panY / s}px)`
  }

  const closeModal = () => setModalIndex(null)
  const goPrev = () => setModalIndex(i => (i > 0 ? i - 1 : i))
  const goNext = () => setModalIndex(i => (i < imageUrls.length - 1 ? i + 1 : i))

  useEffect(() => {
    if (modalIndex === null) return
    ms.current.scale = 1
    ms.current.panX  = 0
    ms.current.panY  = 0
    requestAnimationFrame(applyTransform)
  }, [modalIndex])

  useEffect(() => {
    if (modalIndex !== null) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [modalIndex !== null])

  useEffect(() => {
    if (modalIndex === null) return
    const handler = (e) => {
      if (e.key === 'ArrowLeft')       goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Escape')     closeModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalIndex !== null, imageUrls.length])

  useEffect(() => {
    if (modalIndex === null || !modalRef.current) return
    const el = modalRef.current
    const m  = ms.current
    const totalImages = imageUrls.length

    const onStart = (e) => {
      if (e.touches.length === 2) {
        m.pinchDist  = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        m.pinchScale = m.scale
        m.moving     = true
        return
      }
      if (e.touches.length !== 1) return

      const t = e.touches[0]
      m.startX    = t.clientX
      m.startY    = t.clientY
      m.panStartX = m.panX
      m.panStartY = m.panY
      m.moving    = false
      m.pinchDist = null

      const now = Date.now()
      if (now - m.lastTap < 300) {
        e.preventDefault()
        if (m.scale > 1) { m.scale = 1; m.panX = 0; m.panY = 0 }
        else              { m.scale = 2 }
        applyTransform()
        m.lastTap = 0
      } else {
        m.lastTap = now
      }
    }

    const onMove = (e) => {
      e.preventDefault()

      if (e.touches.length === 2 && m.pinchDist != null) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        m.scale = Math.max(1, Math.min(4, m.pinchScale * dist / m.pinchDist))
        if (m.scale <= 1) { m.scale = 1; m.panX = 0; m.panY = 0 }
        applyTransform()
        return
      }

      if (e.touches.length !== 1) return
      const dx = e.touches[0].clientX - m.startX
      const dy = e.touches[0].clientY - m.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) m.moving = true

      if (m.scale > 1) {
        m.panX = m.panStartX + dx
        m.panY = m.panStartY + dy
        applyTransform()
      }
    }

    const onEnd = (e) => {
      if (e.touches.length > 0) return

      if (m.pinchDist != null) {
        m.pinchDist = null
        m.moving    = false
        return
      }

      if (m.moving && m.scale <= 1 && e.changedTouches.length > 0) {
        const dx = e.changedTouches[0].clientX - m.startX
        if (Math.abs(dx) > 50) {
          setModalIndex(i => {
            if (dx < 0 && i < totalImages - 1) return i + 1
            if (dx > 0 && i > 0)               return i - 1
            return i
          })
        }
      }
      m.moving = false
    }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
    }
  }, [modalIndex !== null])

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>불러오는 중...</div>
  )
  if (!trade) return null

  const isProfit = trade.profit_rate > 0
  const isLoss   = trade.profit_rate < 0
  const hasNetProfit = trade.net_profit_amount != null || trade.net_profit_rate != null

  return (
    <div style={{ padding: isMobile ? '0 0 80px' : '0' }}>

      {/* 상단 버튼 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '16px', flexWrap: 'wrap',
      }}>
        <button onClick={() => navigate(-1)} style={{
          padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '8px', cursor: 'pointer',
          fontSize: isMobile ? '16px' : '14px', color: '#475569',
          whiteSpace: 'nowrap',
        }}>← 뒤로</button>
        <h2 style={{
          fontSize: isMobile ? '18px' : '20px',
          fontWeight: 700, color: '#1e293b', flex: 1,
          margin: 0, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {trade.stock_name} 상세보기
        </h2>
        <Link to={`/edit/${trade.id}`} style={{
          padding: '7px 14px', background: '#2563eb', color: '#fff',
          textDecoration: 'none', borderRadius: '8px',
          fontSize: isMobile ? '16px' : '15px',
          fontWeight: 600, whiteSpace: 'nowrap',
        }}>✏️ 수정</Link>
        <button onClick={deleteTrade} style={{
          padding: '7px 14px', background: '#fee2e2', color: '#dc2626',
          border: '1px solid #fca5a5', borderRadius: '8px',
          fontSize: isMobile ? '16px' : '15px',
          cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
        }}>🗑️ 삭제</button>
      </div>

      {/* 핵심 수익 카드 */}
      <div style={{
        background: trade.profit_rate == null ? '#f8fafc'
          : isProfit ? '#eff6ff' : isLoss ? '#fef2f2' : '#f8fafc',
        border: `1px solid ${trade.profit_rate == null ? '#e2e8f0'
          : isProfit ? '#bfdbfe' : isLoss ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: '16px', padding: isMobile ? '16px' : '24px',
        marginBottom: '12px',
      }}>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
            {trade.stock_name}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {trade.trade_grade && (
              <span style={{
                padding: '2px 10px',
                background: gradeColors[trade.trade_grade] + '20',
                color: gradeColors[trade.trade_grade],
                border: `1px solid ${gradeColors[trade.trade_grade]}40`,
                borderRadius: '6px', fontSize: isMobile ? '16px' : '14px', fontWeight: 700,
              }}>등급 {trade.trade_grade}</span>
            )}
            {trade.market && (
              <span style={{
                padding: '2px 10px', background: '#1e293b',
                color: '#fff', borderRadius: '6px',
                fontSize: isMobile ? '14px' : '13px', fontWeight: 600,
              }}>{trade.market}</span>
            )}
            {trade.sector && (
              <span style={{
                padding: '2px 10px', background: '#f1f5f9',
                color: '#64748b', borderRadius: '6px',
                fontSize: isMobile ? '16px' : '14px',
              }}>{trade.sector}</span>
            )}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: hasNetProfit ? '12px' : 0,
        }}>
          {trade.profit_rate != null && (
            <div>
              <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginBottom: '4px' }}>수익률</div>
              <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 700, color: getProfitColor(trade.profit_rate) }}>
                {isProfit ? '+' : ''}{trade.profit_rate.toFixed(2)}%
              </div>
            </div>
          )}
          {trade.profit_amount != null && (
            <div>
              <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginBottom: '4px' }}>수익금</div>
              <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: getProfitColor(trade.profit_rate) }}>
                {trade.profit_amount >= 0 ? '+' : ''}{formatKRW(trade.profit_amount)}원
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginBottom: '4px' }}>보유기간</div>
            <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: '#1e293b' }}>
              {trade.holding_days != null ? `${trade.holding_days}일` : '-'}
            </div>
          </div>
        </div>

        {hasNetProfit && (
          <div style={{
            display: 'flex', gap: '16px', flexWrap: 'wrap',
            paddingTop: '12px', borderTop: '1px solid #e2e8f0',
          }}>
            {trade.fee != null && (
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수수료</div>
                <div style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: 600, color: '#dc2626' }}>
                  -{formatKRW(trade.fee)}원
                </div>
              </div>
            )}
            {trade.tax != null && trade.tax > 0 && (
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>세금</div>
                <div style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: 600, color: '#dc2626' }}>
                  -{formatKRW(trade.tax)}원
                </div>
              </div>
            )}
            {trade.net_profit_amount != null && (
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>순수익금</div>
                <div style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: 700, color: getProfitColor(trade.net_profit_amount) }}>
                  {trade.net_profit_amount >= 0 ? '+' : ''}{formatKRW(trade.net_profit_amount)}원
                </div>
              </div>
            )}
            {trade.net_profit_rate != null && (
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>순수익률</div>
                <div style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: 700, color: getProfitColor(trade.net_profit_rate) }}>
                  {trade.net_profit_rate >= 0 ? '+' : ''}{Number(trade.net_profit_rate).toFixed(2)}%
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 본문 — 모바일 1열 / PC 2열 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '0 16px',
      }}>
        {/* 왼쪽 */}
        <div>
          <Section title="거래 정보" isMobile={isMobile}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="매수일" value={trade.buy_date} isMobile={isMobile} />
                <Field label="매수가" value={trade.buy_price ? `${formatKRW(trade.buy_price)}원` : null} isMobile={isMobile} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="매도일" value={trade.sell_date} isMobile={isMobile} />
                <Field label="매도가" value={trade.sell_price ? `${formatKRW(trade.sell_price)}원` : null} isMobile={isMobile} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="수량" value={trade.quantity ? `${trade.quantity.toLocaleString()}주` : null} isMobile={isMobile} />
                <Field label="포지션 비중" value={trade.position_size ? `${trade.position_size}%` : null} isMobile={isMobile} />
              </div>
            </div>
          </Section>

          <Section title="분류" isMobile={isMobile}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Field label="섹터" value={trade.sector} isMobile={isMobile} />
              <Field label="매매방식" value={trade.trade_style} isMobile={isMobile} />
              <Field label="시장상황" value={trade.market_condition} isMobile={isMobile} />
            </div>
            <TagList label="테마" items={trade.themes} color="#7c3aed" isMobile={isMobile} />
          </Section>

          <Section title="정성 평가" isMobile={isMobile}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <Field label="매매등급" value={trade.trade_grade} color={gradeColors[trade.trade_grade]} isMobile={isMobile} />
              <Field label="매도이유" value={trade.sell_reason} isMobile={isMobile} />
            </div>
            <TagList label="매수 전 감정" items={trade.emotion_before} color="#f59e0b" isMobile={isMobile} />
            <TagList label="매도 후 감정" items={trade.emotion_after} color="#8b5cf6" isMobile={isMobile} />
            <TagList label="매수 실수"   items={trade.mistake_buy}    color="#dc2626" isMobile={isMobile} />
            <TagList label="매도 실수"   items={trade.mistake_sell}   color="#ea580c" isMobile={isMobile} />
          </Section>
        </div>

        {/* 오른쪽 */}
        <div>
          {(trade.material_context || trade.entry_reason || trade.stop_loss_plan || trade.trade_log) && (
            <Section title="매매 근거" isMobile={isMobile}>
              <Field label="재료 및 시장상황" value={trade.material_context} isMobile={isMobile} markdown />
              <Field label="진입근거"         value={trade.entry_reason}     isMobile={isMobile} markdown />
              <Field label="손절선 설정"      value={trade.stop_loss_plan}   isMobile={isMobile} markdown />
              <Field label="대응 기록"        value={trade.trade_log}        isMobile={isMobile} markdown />
            </Section>
          )}

          {(trade.reflection_good || trade.reflection_bad || trade.reflection_next) && (
            <Section title="성찰" isMobile={isMobile}>
              {trade.reflection_good && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#16a34a', marginBottom: '4px', fontWeight: 600 }}>✅ 잘한 점</div>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#1e293b', lineHeight: '1.6', textAlign: 'left' }}>
                    {renderMarkdown(trade.reflection_good)}
                  </div>
                </div>
              )}
              {trade.reflection_bad && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#dc2626', marginBottom: '4px', fontWeight: 600 }}>❌ 아쉬운 점</div>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#1e293b', lineHeight: '1.6', textAlign: 'left' }}>
                    {renderMarkdown(trade.reflection_bad)}
                  </div>
                </div>
              )}
              {trade.reflection_next && (
                <div>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#2563eb', marginBottom: '4px', fontWeight: 600 }}>💡 다음에는</div>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#1e293b', lineHeight: '1.6', textAlign: 'left' }}>
                    {renderMarkdown(trade.reflection_next)}
                  </div>
                </div>
              )}
            </Section>
          )}

          {trade.news_links && trade.news_links.length > 0 && (
            <Section title="뉴스 / 공시 링크" isMobile={isMobile}>
              {trade.news_links.filter(l => l).map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noreferrer" style={{
                  display: 'block', color: '#2563eb',
                  fontSize: isMobile ? '16px' : '14px',
                  marginBottom: '6px', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>🔗 {link}</a>
              ))}
            </Section>
          )}
        </div>
      </div>

      {/* 차트 이미지 그리드 */}
      {imageUrls.length > 0 && (
        <Section title={`차트 이미지 (${imageUrls.length}장)`} isMobile={isMobile}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px',
          }}>
            {imageUrls.map((url, i) => (
              <div key={i} onClick={() => setModalIndex(i)} style={{
                borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                border: '1px solid #e2e8f0', aspectRatio: '16/9',
              }}>
                <img src={url} alt={`차트 ${i + 1}`} style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 이미지 모달 */}
      {modalIndex !== null && (
        <div
          ref={modalRef}
          style={{
            position: 'fixed', inset: 0,
            height: '100dvh',
            background: 'rgba(0,0,0,0.92)',
            zIndex: 1000,
            display: 'flex', flexDirection: 'column',
            touchAction: 'none',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.55)',
            flexShrink: 0,
          }}>
            <button
              onClick={closeModal}
              style={{
                width:      'clamp(26px, 4vmin, 38px)',
                height:     'clamp(26px, 4vmin, 38px)',
                fontSize:   'clamp(13px, 1.8vmin, 18px)',
                background: 'rgba(255,255,255,0.18)',
                border: 'none', borderRadius: '50%',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >✕</button>

            {imageUrls.length > 1 ? (
              <span style={{
                color: '#fff', fontSize: '15px', fontWeight: 600,
                background: 'rgba(0,0,0,0.35)',
                padding: '4px 12px', borderRadius: '20px',
              }}>
                {modalIndex + 1} / {imageUrls.length}
              </span>
            ) : <div />}

            <div style={{ width: 'clamp(26px, 4vmin, 38px)', flexShrink: 0 }} />
          </div>

          <div style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {imageUrls.length > 1 && (
              <button
                onClick={goPrev}
                style={{
                  position: 'absolute', left: '8px', zIndex: 5,
                  width:    'clamp(28px, 5vmin, 42px)',
                  height:   'clamp(28px, 5vmin, 42px)',
                  fontSize: 'clamp(12px, 1.6vmin, 17px)',
                  background: modalIndex > 0
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(255,255,255,0.06)',
                  border: 'none', borderRadius: '50%',
                  color: modalIndex > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
                  cursor: modalIndex > 0 ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >◀</button>
            )}

            <img
              ref={imgRef}
              src={imageUrls[modalIndex]}
              alt={`차트 ${modalIndex + 1}`}
              draggable={false}
              style={{
                maxWidth: '88%',
                maxHeight: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                transformOrigin: 'center center',
                display: 'block',
                pointerEvents: 'none',
              }}
            />

            {imageUrls.length > 1 && (
              <button
                onClick={goNext}
                style={{
                  position: 'absolute', right: '8px', zIndex: 5,
                  width:    'clamp(28px, 5vmin, 42px)',
                  height:   'clamp(28px, 5vmin, 42px)',
                  fontSize: 'clamp(12px, 1.6vmin, 17px)',
                  background: modalIndex < imageUrls.length - 1
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(255,255,255,0.06)',
                  border: 'none', borderRadius: '50%',
                  color: modalIndex < imageUrls.length - 1 ? '#fff' : 'rgba(255,255,255,0.25)',
                  cursor: modalIndex < imageUrls.length - 1 ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >▶</button>
            )}
          </div>

          {imageUrls.length > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: '8px', padding: '14px 16px',
              flexShrink: 0,
            }}>
              {imageUrls.map((_, i) => (
                <div
                  key={i}
                  onClick={() => {
                    ms.current.scale = 1
                    ms.current.panX  = 0
                    ms.current.panY  = 0
                    setModalIndex(i)
                  }}
                  style={{
                    width:      i === modalIndex
                      ? 'clamp(14px, 2.5vmin, 22px)'
                      : 'clamp(5px,  1vmin,   8px)',
                    height:     'clamp(5px, 1vmin, 8px)',
                    borderRadius: '4px',
                    background: i === modalIndex
                      ? '#fff'
                      : 'rgba(255,255,255,0.32)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}