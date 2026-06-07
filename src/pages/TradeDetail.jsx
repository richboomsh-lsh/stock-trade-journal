import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatKRW, getProfitColor, gradeColors } from '../lib/tradeHelpers'

// 모바일 감지 훅
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function Field({ label, value, color }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '14px', color: color || '#1e293b', lineHeight: '1.6' }}>{value}</div>
    </div>
  )
}

function TagList({ label, items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '6px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {items.map((item, i) => (
          <span key={i} style={{
            padding: '2px 10px', background: '#f1f5f9', color: '#475569',
            borderRadius: '20px', fontSize: '14px', border: '1px solid #e2e8f0',
          }}>{item}</span>
        ))}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
      padding: '16px', marginBottom: '12px',
    }}>
      <h3 style={{
        fontSize: '14px', fontWeight: 700, color: '#64748b', marginBottom: '14px',
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
  const [selectedImage, setSelectedImage] = useState(null)

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

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>불러오는 중...</div>
  )
  if (!trade) return null

  const isProfit = trade.profit_rate > 0
  const isLoss = trade.profit_rate < 0

  return (
    <div style={{ padding: isMobile ? '0 0 80px' : '0' }}>

      {/* ✅ 상단 버튼 - 모바일에서 줄바꿈 허용 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: '16px', flexWrap: 'wrap',
      }}>
        <button onClick={() => navigate(-1)} style={{
          padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#475569',
          whiteSpace: 'nowrap',
        }}>← 뒤로</button>
        <h2 style={{
          fontSize: isMobile ? '17px' : '20px',
          fontWeight: 700, color: '#1e293b', flex: 1,
          margin: 0, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {trade.stock_name} 상세보기
        </h2>
        <Link to={`/edit/${trade.id}`} style={{
          padding: '7px 14px', background: '#2563eb', color: '#fff',
          textDecoration: 'none', borderRadius: '8px',
          fontSize: isMobile ? '14px' : '15px',
          fontWeight: 600, whiteSpace: 'nowrap',
        }}>✏️ 수정</Link>
        <button onClick={deleteTrade} style={{
          padding: '7px 14px', background: '#fee2e2', color: '#dc2626',
          border: '1px solid #fca5a5', borderRadius: '8px',
          fontSize: isMobile ? '14px' : '15px',
          cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
        }}>🗑️ 삭제</button>
      </div>

      {/* ✅ 핵심 수익 카드 - 모바일 2x2 그리드 */}
      <div style={{
        background: trade.profit_rate == null ? '#f8fafc'
          : isProfit ? '#eff6ff' : isLoss ? '#fef2f2' : '#f8fafc',
        border: `1px solid ${trade.profit_rate == null ? '#e2e8f0'
          : isProfit ? '#bfdbfe' : isLoss ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: '16px', padding: isMobile ? '16px' : '24px',
        marginBottom: '12px',
      }}>
        {/* 종목명 + 등급/섹터 */}
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
                borderRadius: '6px', fontSize: '14px', fontWeight: 700,
              }}>등급 {trade.trade_grade}</span>
            )}
            {trade.sector && (
              <span style={{
                padding: '2px 10px', background: '#f1f5f9',
                color: '#64748b', borderRadius: '6px', fontSize: '14px',
              }}>{trade.sector}</span>
            )}
          </div>
        </div>

        {/* ✅ 수익률/수익금/보유기간 - 모바일 2열 그리드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: '12px',
        }}>
          {trade.profit_rate != null && (
            <div>
              <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '4px' }}>수익률</div>
              <div style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 700, color: getProfitColor(trade.profit_rate) }}>
                {isProfit ? '+' : ''}{trade.profit_rate.toFixed(2)}%
              </div>
            </div>
          )}
          {trade.profit_amount != null && (
            <div>
              <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '4px' }}>수익금</div>
              <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: getProfitColor(trade.profit_rate) }}>
                {trade.profit_amount >= 0 ? '+' : ''}{formatKRW(trade.profit_amount)}원
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '4px' }}>보유기간</div>
            <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 700, color: '#1e293b' }}>
              {trade.holding_days != null ? `${trade.holding_days}일` : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 본문 - 모바일은 1열, PC는 2열 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '0 16px',
      }}>
        {/* 왼쪽 (or 모바일 전체) */}
        <div>
          <Section title="거래 정보">
            {/* ✅ 날짜/가격 - 모바일에서 각 행을 flex로 나란히 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="매수일" value={trade.buy_date} />
                <Field label="매수가" value={trade.buy_price ? `${formatKRW(trade.buy_price)}원` : null} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="매도일" value={trade.sell_date} />
                <Field label="매도가" value={trade.sell_price ? `${formatKRW(trade.sell_price)}원` : null} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="수량" value={trade.quantity ? `${trade.quantity.toLocaleString()}주` : null} />
                <Field label="포지션 비중" value={trade.position_size ? `${trade.position_size}%` : null} />
              </div>
            </div>
          </Section>

          <Section title="분류">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Field label="섹터" value={trade.sector} />
              <Field label="매매방식" value={trade.trade_style} />
              <Field label="시장상황" value={trade.market_condition} />
            </div>
            <TagList label="테마" items={trade.themes} />
          </Section>

          <Section title="정성 평가">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Field label="매매등급" value={trade.trade_grade} color={gradeColors[trade.trade_grade]} />
              <Field label="감정상태" value={trade.emotion_state} />
              <Field label="매도이유" value={trade.sell_reason} />
            </div>
            <TagList label="실수유형" items={trade.mistake_types} />
          </Section>
        </div>

        {/* 오른쪽 (모바일에선 아래로 이어짐) */}
        <div>
          {(trade.material_context || trade.entry_reason || trade.stop_loss_plan || trade.response_record) && (
            <Section title="매매 근거">
              <Field label="재료 및 시장상황" value={trade.material_context} />
              <Field label="진입근거" value={trade.entry_reason} />
              <Field label="손절선 설정" value={trade.stop_loss_plan} />
              <Field label="대응 기록" value={trade.response_record} />
            </Section>
          )}

          {(trade.reflection_good || trade.reflection_bad || trade.reflection_next) && (
            <Section title="성찰">
              {trade.reflection_good && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '14px', color: '#16a34a', marginBottom: '4px', fontWeight: 600 }}>✅ 잘한 점</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.6' }}>{trade.reflection_good}</div>
                </div>
              )}
              {trade.reflection_bad && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '14px', color: '#dc2626', marginBottom: '4px', fontWeight: 600 }}>❌ 아쉬운 점</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.6' }}>{trade.reflection_bad}</div>
                </div>
              )}
              {trade.reflection_next && (
                <div>
                  <div style={{ fontSize: '14px', color: '#2563eb', marginBottom: '4px', fontWeight: 600 }}>💡 다음에는</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.6' }}>{trade.reflection_next}</div>
                </div>
              )}
            </Section>
          )}

          {trade.news_links && trade.news_links.length > 0 && (
            <Section title="뉴스 / 공시 링크">
              {trade.news_links.filter(l => l).map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noreferrer" style={{
                  display: 'block', color: '#2563eb', fontSize: '14px',
                  marginBottom: '6px', textDecoration: 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>🔗 {link}</a>
              ))}
            </Section>
          )}
        </div>
      </div>

      {/* ✅ 차트 이미지 - 모바일 1열, PC 자동 */}
      {imageUrls.length > 0 && (
        <Section title={`차트 이미지 (${imageUrls.length}장)`}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? '1fr'
              : 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px',
          }}>
            {imageUrls.map((url, i) => (
              <div key={i} onClick={() => setSelectedImage(url)} style={{
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

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div onClick={() => setSelectedImage(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
          <img src={selectedImage} alt="차트 확대" style={{
            maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px',
          }} />
          <button onClick={() => setSelectedImage(null)} style={{
            position: 'fixed', top: '16px', right: '16px',
            background: '#fff', border: 'none', borderRadius: '50%',
            width: '40px', height: '40px', fontSize: '20px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>✕</button>
        </div>
      )}
    </div>
  )
}