import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { calcProfitAmount, calcProfitRate, calcHoldingDays } from '../lib/tradeHelpers'

const DEFAULT_OPTIONS = {
  sector: ['에너지', '반도체', '바이오', '금융', '소비재', '화학', '철강', '건설', '운송', '기타'],
  trade_style: ['눌림목', '상한가따라잡기', '돌파매수', '역추세', '스캘핑', '기타'],
  market_condition: ['상승장', '하락장', '횡보장'],
  sell_reason: ['손절', '목표가도달', '시간손절', '재료소멸', '충동매도'],
  theme: ['전쟁', '금리', '정책', 'AI', '반도체', '바이오', '환율', '원자재', '실적', '기타'],
  emotion_before: ['냉정', '설렘', '불안', '과신', 'FOMO', '망설임'],
  emotion_after: ['만족', '후회', '아쉬움', '안도', '욕심', '평온'],
  mistake_buy: ['늦은진입', '과도한비중', '근거없는진입', '뇌동매매'],
  mistake_sell: ['이른매도', '손절미이행', '충동매도', '목표가변경'],
}

const GRADES = ['A', 'B', 'C', 'D']

/* ─────────────────────────────────────────
   분할 매수/매도 유틸 함수
   ⚠ PATCH 005 원칙: 아래 함수·컴포넌트는 반드시 모듈 최상단에 정의
   (컴포넌트 내부에 정의하면 매 렌더마다 재생성되어 입력 포커스가 소실됨)
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

// 혹시 'KOSPI'/'KOSDAQ'(영문)으로 저장된 데이터가 있어도 한글로 정규화해서 불러옴
// (저장 시에는 항상 한글 '코스피'/'코스닥'로 저장됨 — 명세서 8-13 규칙)
function normalizeMarket(m) {
  if (m === 'KOSPI') return '코스피'
  if (m === 'KOSDAQ') return '코스닥'
  return m || ''
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function SectionBox({ children }) {
  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e9eef5',
      borderRadius: '10px',
      padding: '14px 16px',
      marginTop: '4px',
    }}>
      {children}
    </div>
  )
}

function Section({ title, children, isMobile }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        fontSize: '16px',
        fontWeight: 700,
        color: '#1e3a8a',
        margin: '0 0 16px',
        padding: '9px 14px',
        background: '#eff6ff',
        borderLeft: '4px solid #2563eb',
        borderRadius: '6px',
        letterSpacing: '0.2px',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ children, cols = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '12px',
      marginBottom: '12px',
    }}>
      {children}
    </div>
  )
}

function TagSelector({ options, selected, onChange, color = '#2563eb', isMobile }) {
  const toggle = (item) => {
    if (selected.includes(item)) onChange(selected.filter(i => i !== item))
    else onChange([...selected, item])
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map(opt => {
        const active = selected.includes(opt)
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)} style={{
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: isMobile ? '16px' : '14px',
            cursor: 'pointer',
            background: active ? color + '15' : '#f8fafc',
            color: active ? color : '#64748b',
            border: `1px solid ${active ? color + '60' : '#e2e8f0'}`,
            fontWeight: active ? 600 : 400,
          }}>{opt}</button>
        )
      })}
    </div>
  )
}

// ── 분할 매수/매도 행 입력 컴포넌트 (모듈 최상단 정의 — 포커스 버그 방지) ──
function SplitRows({ splits, onAdd, onRemove, onChange, maxRows, accentColor, labels, isMobile, inputStyle }) {
  return (
    <>
      {splits.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{
            fontSize: isMobile ? '14px' : '13px', color: '#64748b',
            minWidth: '30px', fontWeight: 700, flexShrink: 0,
          }}>{i + 1}차</div>

          <input
            className="et-input"
            inputMode="numeric"
            placeholder="수량"
            value={row.qtyDisplay}
            onChange={e => onChange(i, 'qty', e)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            className="et-input"
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
            fontSize: isMobile ? '14px' : '13px', fontWeight: 500, marginTop: '4px',
          }}>+ 차수 추가 (최대 {maxRows}차)</button>
      )}
    </>
  )
}

// ── 분할 매수/매도 합계 표시 카드 (모듈 최상단 정의) ──
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
          <div style={{ fontSize: isMobile ? '13px' : '12px', color: '#64748b' }}>{label}</div>
          <div style={{ fontWeight: 700, fontSize: isMobile ? '15px' : '14px', color: color || '#1e293b' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

// 수익 색상: 양수=빨강, 음수=파랑, 0=회색
function profitColor(value) {
  if (value > 0) return '#dc2626'
  if (value < 0) return '#2563eb'
  return '#6b7280'
}

export default function EditTrade() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)

  const [themes, setThemes] = useState([])
  const [emotionBefore, setEmotionBefore] = useState([])
  const [emotionAfter, setEmotionAfter] = useState([])
  const [mistakeBuy, setMistakeBuy] = useState([])
  const [mistakeSell, setMistakeSell] = useState([])
  const [market, setMarket] = useState('')

  // ✅ 수정: 기본값을 DB 저장 형식(소수)으로 맞춤 (0.015% → 0.00015)
  const [feeSettings, setFeeSettings] = useState({
    buy_fee_rate: 0.00015,
    sell_fee_rate: 0.00015,
    tax_rate: 0.0018,
  })
  // ✅ PATCH 006 신규: 포지션 비중 자동계산을 위한 총자산 값
  const [totalAssets, setTotalAssets] = useState(0)

  // ✅ PATCH 006 신규: 매수가/매도가/수량 수동입력 → 분할 매수·매도 입력으로 전환
  const [buySplits, setBuySplits] = useState([makeSplitRow()])
  const [sellSplits, setSellSplits] = useState([makeSplitRow()])

  const [existingImages, setExistingImages] = useState([])
  const [existingUrls, setExistingUrls] = useState([])
  const [removedImages, setRemovedImages] = useState([])
  const [newFiles, setNewFiles] = useState([])
  const [newPreviews, setNewPreviews] = useState([])
  const [uploadProgress, setUploadProgress] = useState(false)
  const [pasteHint, setPasteHint] = useState(false)

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1.5px solid #d1d5db',
    borderRadius: '8px',
    fontSize: isMobile ? '16px' : '14px',
    boxSizing: 'border-box',
    background: '#fff',
  }
  const textareaStyle = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: '80px',
    lineHeight: '1.6',
    fontFamily: 'inherit',
  }

  const labelEl = (text, required) => (
    <label style={{
      display: 'block',
      fontSize: isMobile ? '14px' : '12px',
      fontWeight: 600,
      color: '#64748b',
      letterSpacing: '0.3px',
      marginBottom: '6px',
    }}>
      {text}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
  )

  const buyDate = watch('buy_date')
  const sellDate = watch('sell_date')

  /* ──────────────────────────────────────
     분할 매수/매도 계산값 (PATCH 006)
  ────────────────────────────────────── */
  const buyStats = calcSplitStats(buySplits)
  const sellStats = calcSplitStats(sellSplits)

  const remainingQty = buyStats.totalQty - sellStats.totalQty
  const isComplete = buyStats.totalQty > 0 && remainingQty <= 0

  // 포지션 비중 = 총 매수금액 ÷ 총자산 × 100 (Settings의 total_assets 사용)
  const totalAssetsNum = Number(totalAssets) || 0
  const positionSize = (buyStats.totalAmount > 0 && totalAssetsNum > 0)
    ? (buyStats.totalAmount / totalAssetsNum * 100) : 0

  // 수익금/수익률은 "매도된 수량" 기준으로 계산 (잔여 수량 제외)
  const profitAmount = (sellStats.totalQty > 0 && buyStats.avgPrice > 0)
    ? calcProfitAmount(buyStats.avgPrice, sellStats.avgPrice, sellStats.totalQty) : null
  const profitRate = (buyStats.avgPrice > 0 && sellStats.totalQty > 0)
    ? calcProfitRate(buyStats.avgPrice, sellStats.avgPrice) : null
  // 보유기간은 매도 완료(전량 매도) 시에만 계산
  const holdingDays = (buyDate && sellDate && isComplete)
    ? calcHoldingDays(buyDate, sellDate) : null

  // 수수료·세금은 매도 완료(전량 매도) 시에만 확정 — 매수/매도 "합산 금액" 기준
  const fee = (isComplete && buyStats.totalAmount > 0)
    ? Math.round(
        buyStats.totalAmount  * feeSettings.buy_fee_rate +
        sellStats.totalAmount * feeSettings.sell_fee_rate
      )
    : null

  // 세금 = 매도 합산금액 × 세율 (수익 여부와 무관하게 항상 발생)
  const tax = (isComplete && sellStats.totalAmount > 0)
    ? Math.round(sellStats.totalAmount * feeSettings.tax_rate)
    : null

  const netProfitAmount = (profitAmount !== null && fee !== null && tax !== null)
    ? profitAmount - fee - tax
    : null

  const netProfitRate = (netProfitAmount !== null && buyStats.totalAmount > 0)
    ? (netProfitAmount / buyStats.totalAmount) * 100
    : null

  /* ──────────────────────────────────────
     분할 입력 행 변경 핸들러
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

  useEffect(() => {
    loadOptions()
    loadFeeSettings()
    fetchTrade()
  }, [id])

  const loadOptions = async () => {
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('category, label')
      .order('sort_order', { ascending: true })
    if (error || !data) return
    const grouped = { ...DEFAULT_OPTIONS }
    const categories = [...new Set(data.map(r => r.category))]
    categories.forEach(cat => {
      grouped[cat] = data.filter(r => r.category === cat).map(r => r.label)
    })
    setOptions(grouped)
  }

  const loadFeeSettings = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('buy_fee_rate, sell_fee_rate, tax_rate, total_assets')
      .eq('id', 1)
      .single()
    if (!error && data) {
      // ✅ 수정: DB 저장값(소수)을 그대로 사용
      setFeeSettings({
        buy_fee_rate:  Number(data.buy_fee_rate)  || 0.00015,
        sell_fee_rate: Number(data.sell_fee_rate) || 0.00015,
        tax_rate:      Number(data.tax_rate)      || 0.0018,
      })
      setTotalAssets(Number(data.total_assets) || 0)
    }
  }

  const fetchTrade = async () => {
    const { data, error } = await supabase
      .from('trades').select('*').eq('id', id).single()
    if (error || !data) {
      alert('매매 기록을 찾을 수 없습니다.')
      navigate('/journal')
      return
    }
    const fields = [
      'stock_name', 'buy_date', 'sell_date',
      'sector', 'trade_style', 'market_condition',
      'trade_grade', 'sell_reason',
      'material_context', 'entry_reason', 'stop_loss_plan', 'trade_log',
      'reflection_good', 'reflection_bad', 'reflection_next',
    ]
    fields.forEach(f => setValue(f, data[f] || ''))

    // ✅ PATCH 006: 분할 매수/매도 데이터 불러오기
    // buy_splits/sell_splits가 있으면 그대로 사용, 없으면(과거 단일 입력 데이터)
    // 기존 buy_price/sell_price/quantity로 1차 단일 행을 구성해 하위 호환 처리
    const buySplitsFromDb = (data.buy_splits && data.buy_splits.length > 0)
      ? data.buy_splits
      : (data.quantity && data.buy_price ? [{ quantity: data.quantity, price: data.buy_price }] : [])
    const sellSplitsFromDb = (data.sell_splits && data.sell_splits.length > 0)
      ? data.sell_splits
      : (data.quantity && data.sell_price ? [{ quantity: data.quantity, price: data.sell_price }] : [])

    const toRows = (arr) => arr.length > 0
      ? arr.map(r => {
          const qtyStr = String(Math.round(Number(r.quantity)))
          const priceStr = String(Math.round(Number(r.price)))
          return {
            qty: qtyStr,
            price: priceStr,
            qtyDisplay: Number(qtyStr).toLocaleString(),
            priceDisplay: Number(priceStr).toLocaleString(),
          }
        })
      : [makeSplitRow()]

    setBuySplits(toRows(buySplitsFromDb))
    setSellSplits(toRows(sellSplitsFromDb))

    setMarket(normalizeMarket(data.market))
    setThemes(data.themes || [])
    setEmotionBefore(data.emotion_before || [])
    setEmotionAfter(data.emotion_after || [])
    setMistakeBuy(data.mistake_buy || [])
    setMistakeSell(data.mistake_sell || [])

    const links = data.news_links || []
    for (let i = 0; i < 3; i++) setValue(`news_link_${i}`, links[i] || '')

    if (data.chart_images && data.chart_images.length > 0) {
      setExistingImages(data.chart_images)
      const urls = data.chart_images.map(path => {
        const { data: urlData } = supabase.storage.from('chart-images').getPublicUrl(path)
        return urlData.publicUrl
      })
      setExistingUrls(urls)
    }
    setLoading(false)
  }

  const addNewImages = useCallback((files) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    setNewFiles(prev => [...prev, ...imageFiles])
    const previews = imageFiles.map(f => URL.createObjectURL(f))
    setNewPreviews(prev => [...prev, ...previews])
  }, [])

  const onDrop = useCallback((acceptedFiles) => { addNewImages(acceptedFiles) }, [addNewImages])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [] }, multiple: true,
  })

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return
      const files = imageItems.map(item => item.getAsFile()).filter(Boolean)
      const namedFiles = files.map((file, i) => {
        const ext = file.type.split('/')[1] || 'png'
        return new File([file], `paste_${Date.now()}_${i}.${ext}`, { type: file.type })
      })
      addNewImages(namedFiles)
      setPasteHint(true)
      setTimeout(() => setPasteHint(false), 2000)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addNewImages])

  const removeExisting = (index) => {
    setRemovedImages(prev => [...prev, existingImages[index]])
    setExistingImages(prev => prev.filter((_, i) => i !== index))
    setExistingUrls(prev => prev.filter((_, i) => i !== index))
  }

  const removeNew = (index) => {
    URL.revokeObjectURL(newPreviews[index])
    setNewFiles(prev => prev.filter((_, i) => i !== index))
    setNewPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const onSubmit = async (formData) => {
    if (buyStats.totalQty === 0) { alert('매수 정보(수량, 매수가)를 입력해주세요.'); return }

    setSaving(true)
    setUploadProgress(true)

    try {
      if (removedImages.length > 0) {
        await supabase.storage.from('chart-images').remove(removedImages)
      }

      const uploadedPaths = []
      for (const file of newFiles) {
        const ext = file.name.split('.').pop() || 'png'
        const path = `charts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('chart-images').upload(path, file)
        if (!error) uploadedPaths.push(path)
      }

      const finalImagePaths = [...existingImages, ...uploadedPaths]

      const newsLinks = [0, 1, 2]
        .map(i => formData[`news_link_${i}`])
        .filter(l => l && l.trim())

      // ✅ PATCH 006: 분할 매수/매도 유효 행만 추출
      const buySplitsClean = buySplits
        .filter(r => r.qty && r.price)
        .map(r => ({ quantity: Number(r.qty), price: Number(r.price) }))
      const sellSplitsClean = sellSplits
        .filter(r => r.qty && r.price)
        .map(r => ({ quantity: Number(r.qty), price: Number(r.price) }))

      const payload = {
        stock_name:     formData.stock_name,
        market:         market || null,
        buy_date:       formData.buy_date,
        buy_price:      buyStats.avgPrice > 0 ? parseFloat(buyStats.avgPrice.toFixed(2)) : null,
        sell_date:      isComplete && formData.sell_date ? formData.sell_date : null,
        sell_price:     isComplete && sellStats.avgPrice > 0 ? parseFloat(sellStats.avgPrice.toFixed(2)) : null,
        quantity:       buyStats.totalQty || null,
        position_size:  positionSize > 0 ? parseFloat(positionSize.toFixed(2)) : null,
        profit_amount:  profitAmount !== null ? parseFloat(profitAmount.toFixed(2)) : null,
        profit_rate:    profitRate   !== null ? parseFloat(profitRate.toFixed(4))   : null,
        holding_days:   holdingDays,
        fee:            fee,
        tax:            tax,
        net_profit_amount: netProfitAmount !== null ? Math.round(netProfitAmount) : null,
        net_profit_rate:   netProfitRate   !== null ? parseFloat(netProfitRate.toFixed(4)) : null,
        sector:            formData.sector         || null,
        themes:            themes.length > 0       ? themes       : null,
        trade_style:       formData.trade_style    || null,
        market_condition:  formData.market_condition || null,
        trade_grade:       formData.trade_grade    || null,
        emotion_before:    emotionBefore.length > 0 ? emotionBefore : null,
        emotion_after:     emotionAfter.length > 0  ? emotionAfter  : null,
        sell_reason:       formData.sell_reason    || null,
        mistake_buy:       mistakeBuy.length > 0   ? mistakeBuy   : null,
        mistake_sell:      mistakeSell.length > 0  ? mistakeSell  : null,
        material_context:  formData.material_context || null,
        entry_reason:      formData.entry_reason   || null,
        stop_loss_plan:    formData.stop_loss_plan  || null,
        trade_log:         formData.trade_log       || null,
        reflection_good:   formData.reflection_good || null,
        reflection_bad:    formData.reflection_bad  || null,
        reflection_next:   formData.reflection_next || null,
        chart_images:      finalImagePaths.length > 0 ? finalImagePaths : null,
        news_links:        newsLinks.length > 0 ? newsLinks : null,
        // ✅ PATCH 006 신규 필드
        buy_splits:        buySplitsClean.length > 0  ? buySplitsClean  : null,
        sell_splits:       sellSplitsClean.length > 0 ? sellSplitsClean : null,
        updated_at:        new Date().toISOString(),
      }

      const { error } = await supabase.from('trades').update(payload).eq('id', id)
      if (error) throw error
      navigate(`/trade/${id}`)
    } catch (err) {
      alert('저장 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setSaving(false)
      setUploadProgress(false)
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>불러오는 중...</div>
  )

  return (
    <div>
      <style>{`
        .et-input:focus {
          outline: none;
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{
          padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '8px', cursor: 'pointer',
          fontSize: isMobile ? '16px' : '14px', color: '#475569',
        }}>← 뒤로</button>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>✏️ 매매 수정</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* ── 자동계산 미리보기 카드 ── */}
        {profitRate !== null && (
          <div style={{
            background: profitRate >= 0 ? '#eff6ff' : '#fef2f2',
            border: `1px solid ${profitRate >= 0 ? '#bfdbfe' : '#fecaca'}`,
            borderRadius: '12px', padding: '16px', marginBottom: '16px',
          }}>
            {netProfitAmount !== null ? (
              /* 순수익 있을 때: 순수익을 크게, 수익/수수료/세금은 작게 아래에 */
              <>
                {/* 상단: 순수익률·순수익금·보유기간 — 크게 */}
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {netProfitRate !== null && (
                    <div>
                      <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>순수익률</div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: profitColor(netProfitRate) }}>
                        {netProfitRate >= 0 ? '+' : ''}{netProfitRate.toFixed(2)}%
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>순수익금</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: profitColor(netProfitAmount) }}>
                      {netProfitAmount >= 0 ? '+' : ''}{Math.round(netProfitAmount).toLocaleString()}원
                    </div>
                  </div>
                  {holdingDays !== null && (
                    <div>
                      <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>보유기간</div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{holdingDays}일</div>
                    </div>
                  )}
                </div>
                {/* 하단: 수익률·수익금·수수료·세금 — 작게 */}
                <div style={{
                  display: 'flex', gap: '16px', flexWrap: 'wrap',
                  paddingTop: '10px', borderTop: '1px solid #e2e8f0',
                }}>
                  <div>
                    <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수익률</div>
                    <div style={{ fontSize: isMobile ? '15px' : '14px', fontWeight: 600, color: profitColor(profitRate) }}>
                      {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
                    </div>
                  </div>
                  {profitAmount !== null && (
                    <div>
                      <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수익금</div>
                      <div style={{ fontSize: isMobile ? '15px' : '14px', fontWeight: 600, color: profitColor(profitAmount) }}>
                        {profitAmount >= 0 ? '+' : ''}{Math.round(profitAmount).toLocaleString()}원
                      </div>
                    </div>
                  )}
                  {fee !== null && (
                    <div>
                      <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수수료</div>
                      {/* ✅ ▼ 기호: 차감 항목임을 명확히 표시 */}
                      <div style={{ fontSize: isMobile ? '15px' : '14px', fontWeight: 600, color: '#64748b' }}>
                        ▼{fee.toLocaleString()}원
                      </div>
                    </div>
                  )}
                  {tax !== null && tax > 0 && (
                    <div>
                      <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>세금</div>
                      <div style={{ fontSize: isMobile ? '15px' : '14px', fontWeight: 600, color: '#64748b' }}>
                        ▼{tax.toLocaleString()}원
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* 순수익 없을 때: 수익률·수익금·보유기간만 크게 */
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수익률</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: profitColor(profitRate) }}>
                    {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
                  </div>
                </div>
                {profitAmount !== null && (
                  <div>
                    <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수익금</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: profitColor(profitAmount) }}>
                      {profitAmount >= 0 ? '+' : ''}{Math.round(profitAmount).toLocaleString()}원
                    </div>
                  </div>
                )}
                {holdingDays !== null && (
                  <div>
                    <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>보유기간</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{holdingDays}일</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 기본 거래 정보 (PC: 2단, 모바일: 1단) ── */}
        <Section title="기본 거래 정보" isMobile={isMobile}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: isMobile ? '12px' : '20px',
          }}>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('종목명', true)}
            <SectionBox>
              <input
                {...register('stock_name', { required: '종목명을 입력해주세요' })}
                className="et-input"
                style={{ ...inputStyle, borderColor: errors.stock_name ? '#dc2626' : '#d1d5db' }}
                placeholder="예: 삼성전자"
              />
              {errors.stock_name && (
                <p style={{ color: '#dc2626', fontSize: isMobile ? '16px' : '14px', marginTop: '4px' }}>
                  {errors.stock_name.message}
                </p>
              )}
            </SectionBox>
          </div>

          <div>
            {labelEl('시장 구분')}
            <SectionBox>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['코스피', '코스닥'].map(m => (
                  <button key={m} type="button" onClick={() => setMarket(market === m ? '' : m)} style={{
                    flex: 1, padding: '7px 0', borderRadius: '8px',
                    fontSize: isMobile ? '16px' : '14px', cursor: 'pointer',
                    fontWeight: market === m ? 700 : 400,
                    background: market === m
                      ? (m === '코스피' ? '#2563eb' : '#7c3aed')
                      : '#f8fafc',
                    color: market === m ? '#fff' : '#64748b',
                    border: `1px solid ${market === m
                      ? (m === '코스피' ? '#2563eb' : '#7c3aed')
                      : '#e2e8f0'}`,
                    transition: 'all 0.15s',
                  }}>{m}</button>
                ))}
              </div>
            </SectionBox>
          </div>
          </div>
        </Section>

        {/* ── 분할 매수 / 분할 매도 (PC: 2단, 모바일: 1단, PATCH 006) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? '0' : '16px',
          alignItems: 'start',
        }}>
        <div>
        <Section title="분할 매수" isMobile={isMobile}>
          <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#64748b', marginBottom: '12px' }}>
            수량과 매수가를 차수별로 입력하세요. 평균 매수가·총 수량이 자동 계산됩니다.
          </div>
          <SectionBox>
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

            {buyStats.totalQty > 0 && (
              <SumCard isMobile={isMobile} items={[
                { label: '총 매수수량', value: `${buyStats.totalQty.toLocaleString()}주` },
                { label: '평균 매수가', value: buyStats.avgPrice > 0 ? `${Math.round(buyStats.avgPrice).toLocaleString()}원` : '-' },
                { label: '총 매수금액', value: buyStats.totalAmount > 0 ? `${Math.round(buyStats.totalAmount).toLocaleString()}원` : '-' },
                {
                  label: '포지션 비중',
                  value: positionSize > 0
                    ? `${positionSize.toFixed(1)}%`
                    : totalAssetsNum > 0 ? '계산 중' : '설정에서 자산 입력 필요',
                  color: positionSize > 0 ? '#2563eb' : '#94a3b8',
                },
              ]} />
            )}
          </SectionBox>

          <div style={{ marginTop: '12px' }}>
            {labelEl('매수일', true)}
            <SectionBox>
              <input type="date" {...register('buy_date', { required: true })}
                className="et-input" style={inputStyle} />
            </SectionBox>
          </div>
        </Section>
        </div>

        <div>
        {/* ── 분할 매도 (PATCH 006 신규) ── */}
        <Section title="분할 매도" isMobile={isMobile}>
          <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#64748b', marginBottom: '12px' }}>
            매도가 없으면 비워두세요. 잔여 수량이 0이 되면 완료 거래로 처리됩니다.
          </div>
          <SectionBox>
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

            {buyStats.totalQty > 0 && (
              <SumCard isMobile={isMobile} items={[
                { label: '총 매도수량', value: `${sellStats.totalQty.toLocaleString()}주` },
                { label: '평균 매도가', value: sellStats.avgPrice > 0 ? `${Math.round(sellStats.avgPrice).toLocaleString()}원` : '-' },
                {
                  label: '잔여 수량',
                  value: buyStats.totalQty > 0
                    ? `${remainingQty.toLocaleString()}주 ${isComplete ? '(매도 완료)' : '(보유 중)'}`
                    : '-',
                  color: isComplete ? '#16a34a' : '#d97706',
                },
                {
                  label: '현재 매입금액',
                  value: remainingQty > 0 && buyStats.avgPrice > 0
                    ? `${Math.round(remainingQty * buyStats.avgPrice).toLocaleString()}원`
                    : isComplete ? '0원' : '-',
                },
              ]} />
            )}

            {sellStats.totalQty > 0 && !isComplete && buyStats.totalQty > 0 && (
              <div style={{
                marginTop: '10px', padding: '8px 12px',
                background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', color: '#92400e',
              }}>
                ⚠ 잔여 수량({remainingQty.toLocaleString()}주)이 있어 <b>미완료 거래</b>로 저장됩니다.
                수익·순수익은 전체 매도 완료 후 계산됩니다.
              </div>
            )}
          </SectionBox>

          <div style={{ marginTop: '12px' }}>
            {labelEl('매도일')}
            <SectionBox>
              <input type="date" {...register('sell_date')}
                className="et-input" style={inputStyle} />
            </SectionBox>
          </div>
        </Section>
        </div>
        </div>

        {/* ── 분류 정보 ── */}
        <Section title="분류 정보" isMobile={isMobile}>
          <Row>
            <div>
              {labelEl('섹터')}
              <SectionBox>
                <select {...register('sector')} className="et-input" style={inputStyle}>
                  <option value="">선택</option>
                  {options.sector.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </SectionBox>
            </div>
            <div>
              {labelEl('매매방식')}
              <SectionBox>
                <select {...register('trade_style')} className="et-input" style={inputStyle}>
                  <option value="">선택</option>
                  {options.trade_style.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </SectionBox>
            </div>
          </Row>

          <div style={{ marginBottom: '12px' }}>
            {labelEl('시장상황')}
            <SectionBox>
              <select {...register('market_condition')} className="et-input" style={inputStyle}>
                <option value="">선택</option>
                {options.market_condition.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </SectionBox>
          </div>

          <div>
            {labelEl('테마 (복수 선택 가능)')}
            <SectionBox>
              <TagSelector options={options.theme} selected={themes} onChange={setThemes}
                color="#7c3aed" isMobile={isMobile} />
            </SectionBox>
          </div>
        </Section>

        {/* ── 정성 평가 ── */}
        <Section title="정성 평가" isMobile={isMobile}>
          <Row cols={2}>
            <div>
              {labelEl('매매등급')}
              <SectionBox>
                <select {...register('trade_grade')} className="et-input" style={inputStyle}>
                  <option value="">선택</option>
                  {GRADES.map(g => <option key={g} value={g}>등급 {g}</option>)}
                </select>
              </SectionBox>
            </div>
            <div>
              {labelEl('매도이유')}
              <SectionBox>
                <select {...register('sell_reason')} className="et-input" style={inputStyle}>
                  <option value="">선택</option>
                  {options.sell_reason.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </SectionBox>
            </div>
          </Row>

          <div style={{ marginBottom: '12px' }}>
            {labelEl('매수 전 감정 (복수 선택 가능)')}
            <SectionBox>
              <TagSelector options={options.emotion_before} selected={emotionBefore}
                onChange={setEmotionBefore} color="#f59e0b" isMobile={isMobile} />
            </SectionBox>
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('매도 후 감정 (복수 선택 가능)')}
            <SectionBox>
              <TagSelector options={options.emotion_after} selected={emotionAfter}
                onChange={setEmotionAfter} color="#8b5cf6" isMobile={isMobile} />
            </SectionBox>
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('매수 실수 (복수 선택 가능)')}
            <SectionBox>
              <TagSelector options={options.mistake_buy} selected={mistakeBuy}
                onChange={setMistakeBuy} color="#dc2626" isMobile={isMobile} />
            </SectionBox>
          </div>
          <div>
            {labelEl('매도 실수 (복수 선택 가능)')}
            <SectionBox>
              <TagSelector options={options.mistake_sell} selected={mistakeSell}
                onChange={setMistakeSell} color="#ea580c" isMobile={isMobile} />
            </SectionBox>
          </div>
        </Section>

        {/* ── 매매 근거 ── */}
        <Section title="매매 근거" isMobile={isMobile}>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('재료 및 시장상황')}
            <SectionBox>
              <textarea {...register('material_context')} className="et-input" style={textareaStyle}
                placeholder="어떤 재료(뉴스/공시/테마)로 진입했는지 기록하세요" />
            </SectionBox>
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('진입근거')}
            <SectionBox>
              <textarea {...register('entry_reason')} className="et-input" style={textareaStyle}
                placeholder="기술적/재료적 진입 근거를 기록하세요" />
            </SectionBox>
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('손절선 사전 설정')}
            <SectionBox>
              <textarea {...register('stop_loss_plan')} className="et-input"
                style={{ ...textareaStyle, minHeight: '60px' }}
                placeholder="진입 전 설정한 손절가/손절 조건" />
            </SectionBox>
          </div>
          <div>
            {labelEl('대응 기록')}
            <SectionBox>
              <textarea {...register('trade_log')} className="et-input"
                style={{ ...textareaStyle, minHeight: '160px' }}
                placeholder="매매 중 어떻게 대응했는지 기록하세요" />
            </SectionBox>
          </div>
        </Section>

        {/* ── 성찰 ── */}
        <Section title="성찰" isMobile={isMobile}>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('✅ 잘한 점')}
            <SectionBox>
              <textarea {...register('reflection_good')} className="et-input" style={textareaStyle}
                placeholder="이번 매매에서 잘한 점은?" />
            </SectionBox>
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('❌ 아쉬운 점')}
            <SectionBox>
              <textarea {...register('reflection_bad')} className="et-input" style={textareaStyle}
                placeholder="아쉬웠던 점, 실수한 점은?" />
            </SectionBox>
          </div>
          <div>
            {labelEl('💡 다음에는')}
            <SectionBox>
              <textarea {...register('reflection_next')} className="et-input" style={textareaStyle}
                placeholder="다음 번에 어떻게 개선할 것인지?" />
            </SectionBox>
          </div>
        </Section>

        {/* ── 차트 이미지 ── */}
        <Section title="차트 이미지" isMobile={isMobile}>
          {existingUrls.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#64748b', marginBottom: '8px' }}>기존 이미지</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {existingUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: '120px', height: '80px' }}>
                    <img src={url} alt={`기존 ${i + 1}`} style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      borderRadius: '8px', border: '1px solid #e2e8f0',
                    }} />
                    <button type="button" onClick={() => removeExisting(i)} style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      background: '#dc2626', color: '#fff', border: 'none',
                      borderRadius: '50%', width: '20px', height: '20px',
                      cursor: 'pointer', fontSize: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {newPreviews.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#64748b', marginBottom: '8px' }}>새로 추가할 이미지</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {newPreviews.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: '120px', height: '80px' }}>
                    <img src={url} alt={`새 ${i + 1}`} style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      borderRadius: '8px', border: '1px solid #bfdbfe',
                    }} />
                    <button type="button" onClick={() => removeNew(i)} style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      background: '#dc2626', color: '#fff', border: 'none',
                      borderRadius: '50%', width: '20px', height: '20px',
                      cursor: 'pointer', fontSize: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div {...getRootProps()} style={{
            border: `2px dashed ${isDragActive ? '#2563eb' : '#cbd5e1'}`,
            borderRadius: '12px', padding: '32px', textAlign: 'center',
            cursor: 'pointer',
            background: isDragActive ? '#eff6ff' : pasteHint ? '#f0fdf4' : '#f8fafc',
            transition: 'all 0.2s',
          }}>
            <input {...getInputProps()} />
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{pasteHint ? '✅' : '📸'}</div>
            {pasteHint ? (
              <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#16a34a', fontWeight: 600 }}>
                이미지가 붙여넣어졌습니다!
              </div>
            ) : (
              <>
                <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#64748b' }}>
                  {isDragActive ? '여기에 놓으세요!' : '차트 이미지를 드래그하거나 클릭해서 추가하세요'}
                </div>
                <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginTop: '4px' }}>
                  📋 차트 캡처 후 Ctrl+V 붙여넣기도 가능합니다 · JPG, PNG, GIF 지원
                </div>
              </>
            )}
          </div>
        </Section>

        {/* ── 뉴스 링크 ── */}
        <Section title="뉴스 / 공시 링크" isMobile={isMobile}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ marginBottom: '8px' }}>
              <SectionBox>
                <input {...register(`news_link_${i}`)} className="et-input" style={inputStyle}
                  placeholder={`링크 ${i + 1} (https://...)`} type="url" />
              </SectionBox>
            </div>
          ))}
        </Section>

        {/* ── 저장 버튼 ── */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button type="button" onClick={() => navigate(-1)} style={{
            padding: '10px 24px', background: '#fff', border: '1px solid #d1d5db',
            borderRadius: '8px', fontSize: isMobile ? '16px' : '15px',
            cursor: 'pointer', color: '#374151',
          }}>취소</button>
          <button type="submit" disabled={saving} style={{
            padding: '10px 32px',
            background: saving ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: isMobile ? '16px' : '15px', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? (uploadProgress ? '이미지 업로드 중...' : '저장 중...') : '💾 저장하기'}
          </button>
        </div>
      </form>
    </div>
  )
}