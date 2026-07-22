import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { uploadChartImages, nameClipboardFiles } from '../lib/imageUpload'
import dayjs from 'dayjs'

/* ─────────────────────────────────────────
   유틸 함수
───────────────────────────────────────── */
function makeSplitRow() {
  return { qty: '', price: '', qtyDisplay: '', priceDisplay: '' }
}

function updateSplitField(splits, index, field, rawValue) {
  return splits.map((row, i) => {
    if (i !== index) return row
    const display = rawValue === '' ? '' : Number(rawValue).toLocaleString()
    if (field === 'qty') return { ...row, qty: rawValue, qtyDisplay: display }
    return { ...row, price: rawValue, priceDisplay: display }
  })
}

function calcSplitStats(splits) {
  let totalQty = 0, totalAmount = 0
  splits.forEach(({ qty, price }) => {
    const q = Number(qty) || 0
    const p = Number(price) || 0
    if (q > 0 && p > 0) { totalQty += q; totalAmount += q * p }
  })
  const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0
  return { totalQty, totalAmount, avgPrice }
}

function profitColor(rate) {
  if (rate == null) return '#6b7280'
  if (rate > 0) return '#dc2626'
  if (rate < 0) return '#2563eb'
  return '#6b7280'
}

/* ─────────────────────────────────────────
   하위 컴포넌트
───────────────────────────────────────── */
function SectionTitle({ children }) {
  return (
    <div style={{
      fontWeight: 700, fontSize: '16px', color: '#1e3a8a',
      margin: '28px 0 12px', padding: '9px 14px',
      background: '#eff6ff', borderLeft: '4px solid #2563eb',
      borderRadius: '6px', letterSpacing: '0.2px',
    }}>{children}</div>
  )
}

function SectionBox({ children }) {
  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0',
      borderRadius: '8px', padding: '16px',
    }}>{children}</div>
  )
}

function Label({ children, isMobile }) {
  return (
    <div style={{
      fontWeight: 600, color: '#64748b', marginBottom: '6px',
      fontSize: isMobile ? '14px' : '12px',
      letterSpacing: '0.3px',
    }}>{children}</div>
  )
}

function MultiSelect({ options, selected, onChange, color, isMobile }) {
  if (!options || options.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map(opt => {
        const on = selected.includes(opt)
        return (
          <button key={opt} type="button"
            onClick={() => on ? onChange(selected.filter(s => s !== opt)) : onChange([...selected, opt])}
            style={{
              padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
              border: `1.5px solid ${on ? color : '#d1d5db'}`,
              background: on ? color : '#fff',
              color: on ? '#fff' : '#374151',
              fontSize: isMobile ? '16px' : '14px',
              fontWeight: on ? 600 : 400,
            }}
          >{opt}</button>
        )
      })}
    </div>
  )
}

function fsize(isMobile, mobileVal, desktopVal) {
  return isMobile ? mobileVal : desktopVal
}

function SplitRows({ splits, onAdd, onRemove, onChange, maxRows, accentColor, labels, isMobile, inputStyle }) {
  return (
    <>
      {splits.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{
            fontSize: fsize(isMobile, '14px', '13px'), color: '#64748b',
            minWidth: '30px', fontWeight: 700, flexShrink: 0,
          }}>{i + 1}차</div>

          <input
            className="nt-input"
            inputMode="numeric"
            placeholder="수량"
            value={row.qtyDisplay}
            onChange={e => onChange(i, 'qty', e)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            className="nt-input"
            inputMode="numeric"
            placeholder={labels.price}
            value={row.priceDisplay}
            onChange={e => onChange(i, 'price', e)}
            style={{ ...inputStyle, flex: 1 }}
          />

          <button type="button" onClick={() => onRemove(i)}
            style={{
              padding: '8px 10px', border: '1px solid #fca5a5',
              borderRadius: '6px', background: '#fff5f5',
              color: '#dc2626', cursor: 'pointer', fontSize: '14px',
              flexShrink: 0,
            }}>✕</button>
        </div>
      ))}

      {splits.length < maxRows && (
        <button type="button" onClick={onAdd}
          style={{
            padding: '7px 16px', border: `1.5px dashed ${accentColor}44`,
            borderRadius: '6px', background: `${accentColor}0d`,
            color: accentColor, cursor: 'pointer',
            fontSize: fsize(isMobile, '14px', '13px'), fontWeight: 500, marginTop: '4px',
          }}>+ 차수 추가 (최대 {maxRows}차)</button>
      )}
    </>
  )
}

function SumCard({ items, isMobile }) {
  return (
    <div style={{
      marginTop: '14px', padding: '12px',
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '6px', display: 'grid',
      gridTemplateColumns: '1fr 1fr', gap: '10px',
    }}>
      {items.map(({ label, value, color }) => (
        <div key={label}>
          <div style={{ fontSize: fsize(isMobile, '13px', '12px'), color: '#64748b' }}>{label}</div>
          <div style={{ fontWeight: 700, fontSize: fsize(isMobile, '15px', '14px'), color: color || '#1e293b' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────
   메인 컴포넌트
───────────────────────────────────────── */
export default function NewTrade() {
  const navigate = useNavigate()
  const { register, handleSubmit } = useForm()

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  const fs = (m, d) => isMobile ? m : d

  /* ---------- 기본 상태 ---------- */
  const [market, setMarket] = useState('코스피')
  const [buyDate, setBuyDate] = useState('')
  const [sellDate, setSellDate] = useState('')

  /* ---------- 분할 매수/매도 ---------- */
  const [buySplits, setBuySplits] = useState([makeSplitRow()])
  const [sellSplits, setSellSplits] = useState([makeSplitRow()])

  /* ---------- 멀티선택 태그 ---------- */
  const [selectedThemes, setSelectedThemes] = useState([])
  const [emotionBefore, setEmotionBefore] = useState([])
  const [emotionAfter, setEmotionAfter] = useState([])
  const [mistakeBuy, setMistakeBuy] = useState([])
  const [mistakeSell, setMistakeSell] = useState([])

  /* ---------- 드롭다운 옵션 / 설정 ---------- */
  const [opts, setOpts] = useState({
    sector: [], theme: [], trade_style: [], market_condition: [],
    sell_reason: [], emotion_before: [], emotion_after: [],
    mistake_buy: [], mistake_sell: [],
  })
  const [settings, setSettings] = useState({
    buy_fee_rate: 0.00015, sell_fee_rate: 0.00015,
    tax_rate: 0.0018, total_assets: 0,
  })

  /* ---------- 이미지 / 링크 ---------- */
  const [images, setImages] = useState([])
  const [pasteMsg, setPasteMsg] = useState('')
  const [newsLinks, setNewsLinks] = useState([''])

  /* ---------- 제출 ---------- */
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /* ---------- 데이터 로드 ---------- */
  useEffect(() => {
    async function load() {
      const { data: dropData } = await supabase
        .from('dropdown_options').select('category, label')
        .order('sort_order', { ascending: true })
      if (dropData) {
        const g = {}
        dropData.forEach(({ category, label }) => {
          if (!g[category]) g[category] = []
          g[category].push(label)
        })
        setOpts(prev => ({ ...prev, ...g }))
      }
      const { data: sett } = await supabase
        .from('app_settings').select('*').eq('id', 1).single()
      if (sett) setSettings(sett)
    }
    load()
  }, [])

  /* ---------- 붙여넣기 이미지 ---------- */
  useEffect(() => {
    const h = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return
      const files = imageItems.map(item => item.getAsFile()).filter(Boolean)
      const namedFiles = nameClipboardFiles(files)
      setImages(prev => [...prev, ...namedFiles.map(file => ({ file, preview: URL.createObjectURL(file) }))])
      setPasteMsg('이미지가 붙여넣기 되었습니다!')
      setTimeout(() => setPasteMsg(''), 2000)
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [])

  /* ---------- 드래그앤드롭 ---------- */
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    onDrop: files => {
      setImages(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))])
    },
  })

  /* ──────────────────────────────────────
     분할 계산값
  ────────────────────────────────────── */
  const buy = calcSplitStats(buySplits)
  const sell = calcSplitStats(sellSplits)

  const remainingQty = buy.totalQty - sell.totalQty
  const isComplete = buy.totalQty > 0 && remainingQty <= 0

  /* 포지션 비중: 총 매수금액 / 총자산 */
  const totalAssets = Number(settings.total_assets) || 0
  const positionSize = buy.totalAmount > 0 && totalAssets > 0
    ? (buy.totalAmount / totalAssets * 100) : 0

  /* 수익 계산 (매도한 수량 기준) */
  const profitAmount = (sell.totalQty > 0 && buy.avgPrice > 0)
    ? (sell.avgPrice - buy.avgPrice) * sell.totalQty : null
  const profitRate = (buy.avgPrice > 0 && sell.totalQty > 0)
    ? ((sell.avgPrice - buy.avgPrice) / buy.avgPrice * 100) : null
  const holdingDays = (buyDate && sellDate && isComplete)
    ? dayjs(sellDate).diff(dayjs(buyDate), 'day') : null

  /* 수수료·세금·순수익 */
  const buyFeeAmt = buy.totalAmount * (Number(settings.buy_fee_rate) || 0)
  const sellFeeAmt = sell.totalAmount * (Number(settings.sell_fee_rate) || 0)
  const fee = buyFeeAmt + sellFeeAmt
  const tax = sell.totalAmount * (Number(settings.tax_rate) || 0)
  const netProfitAmount = profitAmount != null ? profitAmount - fee - tax : null
  const netProfitRate = (buy.totalAmount > 0 && netProfitAmount != null)
    ? (netProfitAmount / buy.totalAmount * 100) : null

  /* ──────────────────────────────────────
     입력 핸들러 (분할 행)
  ────────────────────────────────────── */
  function handleBuySplitChange(i, field, e) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw !== '' && !/^\d+$/.test(raw)) return
    setBuySplits(updateSplitField(buySplits, i, field, raw))
  }
  function handleSellSplitChange(i, field, e) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw !== '' && !/^\d+$/.test(raw)) return
    setSellSplits(updateSplitField(sellSplits, i, field, raw))
  }

  /* ──────────────────────────────────────
     저장
  ────────────────────────────────────── */
  async function onSubmit(formData) {
    setError('')
    if (buy.totalQty === 0) { setError('매수 정보(수량, 매수가)를 입력해주세요.'); return }
    if (!buyDate) { setError('매수일을 입력해주세요.'); return }
    setSubmitting(true)

    try {
      /* 이미지 업로드 (chart_images에는 항상 "경로"만 저장 — imageUpload.js 참고) */
      const chartImageUrls = await uploadChartImages(images.map(img => img.file))

      const validLinks = newsLinks.filter(l => l.trim())

      /* 유효한 분할 행만 추출 */
      const buySplitsClean = buySplits
        .filter(r => r.qty && r.price)
        .map(r => ({ quantity: Number(r.qty), price: Number(r.price) }))
      const sellSplitsClean = sellSplits
        .filter(r => r.qty && r.price)
        .map(r => ({ quantity: Number(r.qty), price: Number(r.price) }))

      const tradeData = {
        stock_name: formData.stock_name,
        market,
        buy_date: buyDate || null,
        sell_date: isComplete && sellDate ? sellDate : null,

        /* 자동계산 결과 저장 */
        buy_price: buy.avgPrice > 0 ? parseFloat(buy.avgPrice.toFixed(2)) : null,
        sell_price: isComplete && sell.avgPrice > 0 ? parseFloat(sell.avgPrice.toFixed(2)) : null,
        quantity: buy.totalQty || null,
        position_size: positionSize > 0 ? parseFloat(positionSize.toFixed(2)) : null,

        profit_amount: profitAmount != null ? parseFloat(profitAmount.toFixed(2)) : null,
        profit_rate: profitRate != null ? parseFloat(profitRate.toFixed(4)) : null,
        holding_days: holdingDays,

        fee: isComplete ? parseFloat(fee.toFixed(2)) : null,
        tax: isComplete ? parseFloat(tax.toFixed(2)) : null,
        net_profit_amount: netProfitAmount != null ? parseFloat(netProfitAmount.toFixed(2)) : null,
        net_profit_rate: netProfitRate != null ? parseFloat(netProfitRate.toFixed(4)) : null,

        /* 분류 */
        sector: formData.sector || null,
        themes: selectedThemes.length > 0 ? selectedThemes : null,
        trade_style: formData.trade_style || null,
        market_condition: formData.market_condition || null,

        /* 정성 */
        trade_grade: formData.trade_grade || null,
        sell_reason: formData.sell_reason || null,
        emotion_before: emotionBefore.length > 0 ? emotionBefore : null,
        emotion_after: emotionAfter.length > 0 ? emotionAfter : null,
        mistake_buy: mistakeBuy.length > 0 ? mistakeBuy : null,
        mistake_sell: mistakeSell.length > 0 ? mistakeSell : null,

        /* 서술 */
        material_context: formData.material_context || null,
        entry_reason: formData.entry_reason || null,
        stop_loss_plan: formData.stop_loss_plan || null,
        trade_log: formData.trade_log || null,
        reflection_good: formData.reflection_good || null,
        reflection_bad: formData.reflection_bad || null,
        reflection_next: formData.reflection_next || null,

        /* 첨부 */
        chart_images: chartImageUrls.length > 0 ? chartImageUrls : null,
        news_links: validLinks.length > 0 ? validLinks : null,

        /* 분할 내역 (신규) */
        buy_splits: buySplitsClean.length > 0 ? buySplitsClean : null,
        sell_splits: sellSplitsClean.length > 0 ? sellSplitsClean : null,
      }

      const { error: insertErr } = await supabase.from('trades').insert([tradeData])
      if (insertErr) throw insertErr
      navigate('/journal')

    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ──────────────────────────────────────
     스타일
  ────────────────────────────────────── */
  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1.5px solid #d1d5db', borderRadius: '6px',
    fontSize: fs('16px', '14px'), background: '#ffffff',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
    color: '#1e293b',
  }
  const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: '80px' }

  /* ──────────────────────────────────────
     렌더
  ────────────────────────────────────── */
  return (
    <div style={{ maxWidth: isMobile ? '720px' : '1100px', margin: '0 auto', padding: isMobile ? '16px' : '24px 24px 60px' }}>
      <style>{`
        .nt-input:focus {
          outline: none;
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
      `}</style>

      <h2 style={{ fontSize: fs('20px', '22px'), fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
        새 매매 입력
      </h2>
      <p style={{ fontSize: fs('14px', '13px'), color: '#94a3b8', marginBottom: '4px' }}>
        분할 매수·매도를 지원합니다. 평균가와 수익은 자동으로 계산됩니다.
      </p>

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* ── 기본 정보 (PC: 2단, 모바일: 1단) ── */}
        <SectionTitle>기본 정보</SectionTitle>
        <SectionBox>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: isMobile ? '16px' : '20px',
          }}>
            <div>
              <Label isMobile={isMobile}>종목명 *</Label>
              <input
                {...register('stock_name', { required: true })}
                className="nt-input"
                placeholder="예: 삼성전자"
                style={inputStyle}
              />
            </div>

            <div>
              <Label isMobile={isMobile}>시장 구분</Label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[['코스피', '코스피', '#2563eb'], ['코스닥', '코스닥', '#7c3aed']].map(([val, label, color]) => (
                  <button key={val} type="button" onClick={() => setMarket(val)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: '6px', cursor: 'pointer',
                      border: `1.5px solid ${market === val ? color : '#d1d5db'}`,
                      background: market === val ? color : '#fff',
                      color: market === val ? '#fff' : '#374151',
                      fontWeight: market === val ? 700 : 400,
                      fontSize: fs('16px', '14px'),
                    }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </SectionBox>

        {/* ── 분할 매수 / 분할 매도 (PC: 2단, 모바일: 1단) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? '0' : '20px',
          alignItems: 'start',
        }}>
        <div>
        <SectionTitle>분할 매수</SectionTitle>
        <SectionBox>
          <div style={{ fontSize: fs('14px', '13px'), color: '#64748b', marginBottom: '12px' }}>
            수량과 매수가를 차수별로 입력하세요. 평균 매수가·총 수량이 자동 계산됩니다.
          </div>

          <SplitRows
            splits={buySplits}
            onAdd={() => setBuySplits([...buySplits, makeSplitRow()])}
            onRemove={i => setBuySplits(buySplits.length === 1 ? [makeSplitRow()] : buySplits.filter((_, idx) => idx !== i))}
            onChange={handleBuySplitChange}
            maxRows={5}
            accentColor="#2563eb"
            labels={{ price: '매수가' }}
            isMobile={isMobile}
            inputStyle={inputStyle}
          />

          {buy.totalQty > 0 && (
            <SumCard isMobile={isMobile} items={[
              { label: '총 매수수량', value: `${buy.totalQty.toLocaleString()}주` },
              { label: '평균 매수가', value: buy.avgPrice > 0 ? `${Math.round(buy.avgPrice).toLocaleString()}원` : '-' },
              { label: '총 매수금액', value: buy.totalAmount > 0 ? `${Math.round(buy.totalAmount).toLocaleString()}원` : '-' },
              {
                label: '포지션 비중',
                value: positionSize > 0
                  ? `${positionSize.toFixed(1)}%`
                  : totalAssets > 0 ? '계산 중' : '설정에서 자산 입력 필요',
                color: positionSize > 0 ? '#2563eb' : '#94a3b8',
              },
            ]} />
          )}

          <div style={{ marginTop: '16px' }}>
            <Label isMobile={isMobile}>매수일</Label>
            <input type="date" className="nt-input" value={buyDate}
              onChange={e => setBuyDate(e.target.value)} style={inputStyle} />
          </div>
        </SectionBox>
        </div>

        <div>
        {/* ── 분할 매도 ── */}
        <SectionTitle>분할 매도</SectionTitle>
        <SectionBox>
          <div style={{ fontSize: fs('14px', '13px'), color: '#64748b', marginBottom: '12px' }}>
            매도가 없으면 비워두세요. 잔여 수량이 0이 되면 완료 거래로 처리됩니다.
          </div>

          <SplitRows
            splits={sellSplits}
            onAdd={() => setSellSplits([...sellSplits, makeSplitRow()])}
            onRemove={i => setSellSplits(sellSplits.length === 1 ? [makeSplitRow()] : sellSplits.filter((_, idx) => idx !== i))}
            onChange={handleSellSplitChange}
            maxRows={5}
            accentColor="#7c3aed"
            labels={{ price: '매도가' }}
            isMobile={isMobile}
            inputStyle={inputStyle}
          />

          {buy.totalQty > 0 && (
            <SumCard isMobile={isMobile} items={[
              { label: '총 매도수량', value: `${sell.totalQty.toLocaleString()}주` },
              { label: '평균 매도가', value: sell.avgPrice > 0 ? `${Math.round(sell.avgPrice).toLocaleString()}원` : '-' },
              {
                label: '잔여 수량',
                value: buy.totalQty > 0
                  ? `${remainingQty.toLocaleString()}주 ${isComplete ? '(매도 완료)' : '(보유 중)'}`
                  : '-',
                color: isComplete ? '#16a34a' : '#d97706',
              },
              {
                label: '현재 매입금액',
                value: remainingQty > 0 && buy.avgPrice > 0
                  ? `${Math.round(remainingQty * buy.avgPrice).toLocaleString()}원`
                  : isComplete ? '0원' : '-',
              },
            ]} />
          )}

          {sell.totalQty > 0 && !isComplete && buy.totalQty > 0 && (
            <div style={{
              marginTop: '10px', padding: '8px 12px',
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: '6px', fontSize: fs('14px', '13px'), color: '#92400e',
            }}>
              ⚠ 잔여 수량({remainingQty.toLocaleString()}주)이 있어 <b>미완료 거래</b>로 저장됩니다.
              수익·순수익은 전체 매도 완료 후 계산됩니다.
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            <Label isMobile={isMobile}>매도일 {!isComplete && sell.totalQty > 0 ? '(참고용)' : ''}</Label>
            <input type="date" className="nt-input" value={sellDate}
              onChange={e => setSellDate(e.target.value)} style={inputStyle} />
          </div>
        </SectionBox>
        </div>
        </div>

        {/* ── 수익 미리보기 ── */}
        {buy.totalQty > 0 && (
          <>
            <SectionTitle>수익 미리보기</SectionTitle>
            {profitAmount != null ? (
              <div style={{
                padding: '18px',
                background: profitAmount > 0 ? '#fff5f5' : profitAmount < 0 ? '#eff6ff' : '#f8fafc',
                border: `1.5px solid ${profitColor(profitAmount)}33`,
                borderRadius: '10px',
              }}>
                {/* 순수익 - 메인 */}
                {netProfitAmount != null && (
                  <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: fs('13px', '12px'), color: '#64748b', marginBottom: '2px' }}>순수익률</div>
                    <div style={{ fontSize: '30px', fontWeight: 800, color: profitColor(netProfitRate) }}>
                      {netProfitRate >= 0 ? '+' : ''}{netProfitRate?.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: fs('17px', '15px'), fontWeight: 700, color: profitColor(netProfitRate) }}>
                      {netProfitAmount >= 0 ? '+' : ''}{Math.round(netProfitAmount).toLocaleString()}원
                    </div>
                  </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '10px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                  {[
                    { label: '수익률', value: `${profitRate >= 0 ? '+' : ''}${profitRate?.toFixed(2)}%`, color: profitColor(profitRate) },
                    { label: '수익금', value: `${profitAmount >= 0 ? '+' : ''}${Math.round(profitAmount).toLocaleString()}원`, color: profitColor(profitAmount) },
                    { label: '보유기간', value: holdingDays != null ? `${holdingDays}일` : '-', color: '#1e293b' },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: fs('12px', '11px'), color: '#64748b' }}>{label}</div>
                      <div style={{ fontWeight: 700, color, fontSize: fs('15px', '13px') }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center', marginTop: '8px' }}>
                  {[
                    { label: '수수료', value: `▼${Math.round(fee).toLocaleString()}원` },
                    { label: '거래세', value: `▼${Math.round(tax).toLocaleString()}원` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: fs('12px', '11px'), color: '#64748b' }}>{label}</div>
                      <div style={{ fontWeight: 600, color: '#64748b', fontSize: fs('14px', '13px') }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '16px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: '10px',
                textAlign: 'center', color: '#94a3b8',
                fontSize: fs('14px', '13px'),
              }}>
                매도 정보를 입력하면 수익이 자동 계산됩니다
              </div>
            )}
          </>
        )}

        {/* ── 분류 정보 ── */}
        <SectionTitle>분류 정보</SectionTitle>
        <SectionBox>
          <Label isMobile={isMobile}>섹터</Label>
          <select {...register('sector')} className="nt-input" style={inputStyle}>
            <option value="">선택</option>
            {opts.sector.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div style={{ marginTop: '16px' }}>
            <Label isMobile={isMobile}>테마</Label>
            <MultiSelect options={opts.theme} selected={selectedThemes}
              onChange={setSelectedThemes} color="#7c3aed" isMobile={isMobile} />
          </div>

          <div style={{ marginTop: '16px' }}>
            <Label isMobile={isMobile}>매매방식</Label>
            <select {...register('trade_style')} className="nt-input" style={inputStyle}>
              <option value="">선택</option>
              {opts.trade_style.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ marginTop: '16px' }}>
            <Label isMobile={isMobile}>시장상황</Label>
            <select {...register('market_condition')} className="nt-input" style={inputStyle}>
              <option value="">선택</option>
              {opts.market_condition.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </SectionBox>

        {/* ── 정성 평가 ── */}
        <SectionTitle>정성 평가</SectionTitle>
        <SectionBox>
          <Label isMobile={isMobile}>매매등급</Label>
          <select {...register('trade_grade')} className="nt-input" style={inputStyle}>
            <option value="">선택</option>
            {['A', 'B', 'C', 'D'].map(g => <option key={g} value={g}>{g}등급</option>)}
          </select>

          <div style={{ marginTop: '16px' }}>
            <Label isMobile={isMobile}>매도이유</Label>
            <select {...register('sell_reason')} className="nt-input" style={inputStyle}>
              <option value="">선택</option>
              {opts.sell_reason.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {[
            { label: '매수 전 감정', state: emotionBefore, setter: setEmotionBefore, optKey: 'emotion_before', color: '#f59e0b' },
            { label: '매도 후 감정', state: emotionAfter, setter: setEmotionAfter, optKey: 'emotion_after', color: '#8b5cf6' },
            { label: '매수 실수', state: mistakeBuy, setter: setMistakeBuy, optKey: 'mistake_buy', color: '#dc2626' },
            { label: '매도 실수', state: mistakeSell, setter: setMistakeSell, optKey: 'mistake_sell', color: '#ea580c' },
          ].map(({ label, state, setter, optKey, color }) => (
            <div key={label} style={{ marginTop: '16px' }}>
              <Label isMobile={isMobile}>{label}</Label>
              <MultiSelect options={opts[optKey]} selected={state}
                onChange={setter} color={color} isMobile={isMobile} />
            </div>
          ))}
        </SectionBox>

        {/* ── 매매 기록 ── */}
        <SectionTitle>매매 기록</SectionTitle>
        <SectionBox>
          {[
            { name: 'material_context', label: '재료 및 시장상황', ph: '어떤 재료·수급으로 진입했나요?' },
            { name: 'entry_reason', label: '진입근거', ph: '기술적·재료적 진입 근거' },
            { name: 'stop_loss_plan', label: '손절선 사전 설정', ph: '사전에 설정한 손절 기준' },
          ].map(({ name, label, ph }) => (
            <div key={name} style={{ marginBottom: '16px' }}>
              <Label isMobile={isMobile}>{label}</Label>
              <textarea {...register(name)} className="nt-input"
                placeholder={ph} style={textareaStyle} />
            </div>
          ))}

          <Label isMobile={isMobile}>대응 기록</Label>
          <textarea {...register('trade_log')} className="nt-input"
            placeholder="매매 중 대응 기록을 상세히 적어주세요"
            style={{ ...textareaStyle, minHeight: '160px' }} />
        </SectionBox>

        {/* ── 성찰 ── */}
        <SectionTitle>성찰</SectionTitle>
        <SectionBox>
          {[
            { name: 'reflection_good', label: '잘한 점' },
            { name: 'reflection_bad', label: '아쉬운 점' },
            { name: 'reflection_next', label: '다음에는' },
          ].map(({ name, label }) => (
            <div key={name} style={{ marginBottom: '16px' }}>
              <Label isMobile={isMobile}>{label}</Label>
              <textarea {...register(name)} className="nt-input"
                placeholder={label} style={textareaStyle} />
            </div>
          ))}
        </SectionBox>

        {/* ── 차트 이미지 ── */}
        <SectionTitle>차트 이미지</SectionTitle>
        <SectionBox>
          <div {...getRootProps()} style={{
            border: `2px dashed ${isDragActive ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: '8px', padding: '28px', textAlign: 'center',
            background: isDragActive ? '#eff6ff' : '#fafafa',
            cursor: 'pointer', marginBottom: '12px',
          }}>
            <input {...getInputProps()} />
            <div style={{ fontSize: fs('15px', '14px'), color: '#64748b' }}>
              {isDragActive ? '여기에 놓으세요!' : '클릭하거나 드래그해서 이미지 추가'}
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
              Ctrl+V 붙여넣기도 가능합니다
            </div>
          </div>

          {pasteMsg && (
            <div style={{ color: '#16a34a', fontSize: '14px', marginBottom: '8px', fontWeight: 600 }}>
              ✓ {pasteMsg}
            </div>
          )}

          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={img.preview} alt=""
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '6px' }} />
                  <button type="button"
                    onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      border: 'none', borderRadius: '50%',
                      width: '22px', height: '22px', cursor: 'pointer',
                      fontSize: '12px', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </SectionBox>

        {/* ── 뉴스/공시 링크 ── */}
        <SectionTitle>뉴스/공시 링크</SectionTitle>
        <SectionBox>
          {newsLinks.map((link, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input className="nt-input" type="url" value={link}
                onChange={e => {
                  const updated = [...newsLinks]; updated[i] = e.target.value; setNewsLinks(updated)
                }}
                placeholder="https://..."
                style={{ ...inputStyle, flex: 1 }} />
              <button type="button"
                onClick={() => setNewsLinks(newsLinks.filter((_, idx) => idx !== i))}
                style={{
                  padding: '8px 12px', border: '1px solid #fca5a5',
                  borderRadius: '6px', background: '#fff5f5',
                  color: '#dc2626', cursor: 'pointer',
                }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setNewsLinks([...newsLinks, ''])}
            style={{
              padding: '7px 16px', border: '1.5px dashed #d1d5db',
              borderRadius: '6px', background: '#f8fafc',
              color: '#64748b', cursor: 'pointer', fontSize: fs('14px', '13px'),
            }}>+ 링크 추가</button>
        </SectionBox>

        {/* ── 오류 / 제출 ── */}
        {error && (
          <div style={{
            color: '#dc2626', padding: '12px',
            background: '#fff5f5', border: '1px solid #fca5a5',
            borderRadius: '6px', marginTop: '16px',
            fontSize: fs('15px', '14px'),
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', marginBottom: '40px' }}>
          <button type="button" onClick={() => navigate(-1)}
            style={{
              flex: 1, padding: '14px',
              border: '1.5px solid #d1d5db', borderRadius: '8px',
              background: '#fff', color: '#374151',
              fontSize: fs('16px', '15px'), cursor: 'pointer', fontWeight: 600,
            }}>취소</button>

          <button type="submit" disabled={submitting}
            style={{
              flex: 2, padding: '14px',
              border: 'none', borderRadius: '8px',
              background: submitting ? '#94a3b8' : '#2563eb',
              color: '#fff', fontSize: fs('16px', '15px'),
              cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700,
            }}>
            {submitting ? '저장 중...' : '매매 저장'}
          </button>
        </div>

      </form>
    </div>
  )
}