import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { calcProfitAmount, calcProfitRate, calcHoldingDays } from '../lib/tradeHelpers'

const GRADES  = ['A', 'B', 'C', 'D']
const MARKETS = ['코스피', '코스닥']
const GRADE_COLORS = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' }

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

/* ───── 천 단위 콤마 입력 핸들러 ───── */
function handleNumInput(setter) {
  return (e) => {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      setter({ raw, display: raw === '' ? '' : Number(raw).toLocaleString() })
    }
  }
}

/* ───── 공통 컴포넌트 ───── */
function SectionTitle({ children, isMobile }) {
  return (
    <h3 style={{
      fontSize: isMobile ? '16px' : '15px', fontWeight: 600, color: '#1e293b',
      borderLeft: '3px solid #3b82f6', paddingLeft: '10px',
      margin: '28px 0 10px',
    }}>
      {children}
    </h3>
  )
}

function SectionBox({ children }) {
  return (
    <div style={{
      background: '#f8fafc', borderRadius: '8px',
      padding: '16px', border: '1px solid #e2e8f0',
    }}>
      {children}
    </div>
  )
}

function Label({ children, required, isMobile }) {
  return (
    <label style={{
      display: 'block',
      fontSize: isMobile ? '16px' : '14px',
      fontWeight: 600,
      color: '#1e293b',
      marginBottom: '5px',
    }}>
      {children}
      {required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
    </label>
  )
}

function MultiSelect({ options, selected, onChange, color = '#3b82f6', isMobile }) {
  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt))
    else onChange([...selected, opt])
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => toggle(opt)} style={{
          padding: '4px 10px', borderRadius: '20px',
          border: `1px solid ${selected.includes(opt) ? color : '#d1d5db'}`,
          background: selected.includes(opt) ? color : '#f9fafb',
          color: selected.includes(opt) ? '#fff' : '#374151',
          fontSize: isMobile ? '16px' : '14px', cursor: 'pointer',
        }}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function MarketSelect({ value, onChange, isMobile }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {MARKETS.map(m => {
        const color = m === '코스피' ? '#2563eb' : '#7c3aed'
        const isSelected = value === m
        return (
          <button key={m} type="button" onClick={() => onChange(isSelected ? '' : m)} style={{
            padding: '7px 20px', borderRadius: '6px',
            border: `1px solid ${isSelected ? color : '#d1d5db'}`,
            background: isSelected ? color : '#f9fafb',
            color: isSelected ? '#fff' : '#374151',
            fontSize: isMobile ? '16px' : '14px', cursor: 'pointer', fontWeight: isSelected ? 600 : 400,
          }}>
            {m}
          </button>
        )
      })}
    </div>
  )
}

export default function NewTrade() {
  const navigate  = useNavigate()
  const isMobile  = useIsMobile()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const [opts, setOpts] = useState({
    sector: [], theme: [], trade_style: [], market_condition: [],
    sell_reason: [], emotion_before: [], emotion_after: [],
    mistake_buy: [], mistake_sell: [],
  })
  const [optsLoading, setOptsLoading] = useState(true)

  const [feeRate, setFeeRate] = useState({ buy: 0.015, sell: 0.015 })
  const [taxRate, setTaxRate] = useState(0.2)

  /* 숫자 입력 상태 (천 단위 콤마) */
  const [buyPrice,  setBuyPrice]  = useState({ raw: '', display: '' })
  const [sellPrice, setSellPrice] = useState({ raw: '', display: '' })
  const [quantity,  setQuantity]  = useState({ raw: '', display: '' })

  const [market,          setMarket]          = useState('')
  const [sector,          setSector]          = useState('')
  const [themes,          setThemes]          = useState([])
  const [tradeStyle,      setTradeStyle]      = useState('')
  const [marketCondition, setMarketCondition] = useState('')
  const [tradeGrade,      setTradeGrade]      = useState('')
  const [emotionState,    setEmotionState]    = useState('')
  const [emotionBefore,   setEmotionBefore]   = useState([])
  const [emotionAfter,    setEmotionAfter]    = useState([])
  const [sellReason,      setSellReason]      = useState('')
  const [mistakeTypes,    setMistakeTypes]    = useState([])
  const [mistakeBuy,      setMistakeBuy]      = useState([])
  const [mistakeSell,     setMistakeSell]     = useState([])
  const [newsLinks,       setNewsLinks]       = useState([''])

  const [imageFiles,    setImageFiles]    = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [pasteHint,     setPasteHint]     = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm()
  const watchBuyDate  = watch('buy_date')
  const watchSellDate = watch('sell_date')

  /* 자동 계산 */
  const bpNum = Number(buyPrice.raw)
  const spNum = Number(sellPrice.raw)
  const qtNum = Number(quantity.raw)

  const profitAmount = calcProfitAmount(bpNum, spNum, qtNum)
  const profitRate   = calcProfitRate(bpNum, spNum)
  const holdingDays  = calcHoldingDays(watchBuyDate, watchSellDate)

  const hasSell         = buyPrice.raw && sellPrice.raw && quantity.raw
  const buyFee          = hasSell ? Math.round(bpNum * qtNum * (feeRate.buy  / 100)) : 0
  const sellFee         = hasSell ? Math.round(spNum * qtNum * (feeRate.sell / 100)) : 0
  const tax             = hasSell && profitAmount > 0 ? Math.round(profitAmount * (taxRate / 100)) : 0
  const totalFee        = buyFee + sellFee + tax
  const netProfitAmount = hasSell ? profitAmount - totalFee : 0
  const netProfitRate   = hasSell && bpNum && qtNum
    ? (netProfitAmount / (bpNum * qtNum)) * 100 : 0

  /* 스타일 */
  const inputStyle = {
    width: '100%', padding: '8px 12px',
    border: '1.5px solid #d1d5db',
    borderRadius: '6px', fontSize: isMobile ? '16px' : '14px', outline: 'none',
    boxSizing: 'border-box', background: '#ffffff', color: '#1e293b',
    transition: 'border-color 0.15s',
  }
  const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'auto' }

  useEffect(() => {
    const loadData = async () => {
      const { data: dropData } = await supabase
        .from('dropdown_options').select('category, label')
        .order('sort_order', { ascending: true })

      if (dropData) {
        const grouped = {}
        dropData.forEach(({ category, label }) => {
          if (!grouped[category]) grouped[category] = []
          grouped[category].push(label)
        })
        setOpts(prev => ({ ...prev, ...grouped }))
      }

      const { data: settings } = await supabase
        .from('app_settings').select('buy_fee_rate, sell_fee_rate, tax_rate')
        .eq('id', 1).single()

      if (settings) {
        setFeeRate({ buy: settings.buy_fee_rate ?? 0.015, sell: settings.sell_fee_rate ?? 0.015 })
        setTaxRate(settings.tax_rate ?? 0.2)
      }
      setOptsLoading(false)
    }
    loadData()
  }, [])

  const addImages = useCallback((files) => {
    const imageOnly = files.filter(f => f.type.startsWith('image/'))
    if (imageOnly.length === 0) return
    setImageFiles(prev => [...prev, ...imageOnly])
    setImagePreviews(prev => [...prev, ...imageOnly.map(f => URL.createObjectURL(f))])
  }, [])

  const onDrop = useCallback((acceptedFiles) => addImages(acceptedFiles), [addImages])
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
      addImages(namedFiles)
      setPasteHint(true)
      setTimeout(() => setPasteHint(false), 2000)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addImages])

  const removeImage = (index) => {
    URL.revokeObjectURL(imagePreviews[index])
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const addNewsLink    = () => setNewsLinks([...newsLinks, ''])
  const removeNewsLink = (i) => setNewsLinks(newsLinks.filter((_, idx) => idx !== i))
  const updateNewsLink = (i, val) => {
    const updated = [...newsLinks]; updated[i] = val; setNewsLinks(updated)
  }

  const onSubmit = async (data) => {
    setLoading(true)
    setError('')
    if (!buyPrice.raw)    { setError('매수가를 입력해 주세요.');  setLoading(false); return }
    if (!quantity.raw)    { setError('수량을 입력해 주세요.');    setLoading(false); return }
    if (!sector)          { setError('섹터를 선택해 주세요.');    setLoading(false); return }
    if (!tradeStyle)      { setError('매매방식을 선택해 주세요.'); setLoading(false); return }
    if (!marketCondition) { setError('시장상황을 선택해 주세요.'); setLoading(false); return }

    try {
      const uploadedPaths = []
      for (const file of imageFiles) {
        const ext  = file.name.split('.').pop() || 'png'
        const path = `charts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('chart-images').upload(path, file)
        if (!uploadError) uploadedPaths.push(path)
      }

      const payload = {
        stock_name:        data.stock_name,
        market:            market || null,
        buy_date:          data.buy_date,
        buy_price:         bpNum,
        sell_date:         data.sell_date || null,
        sell_price:        sellPrice.raw ? spNum : null,
        quantity:          qtNum,
        position_size:     data.position_size ? Number(data.position_size) : null,
        profit_amount:     hasSell ? profitAmount     : null,
        profit_rate:       hasSell ? profitRate       : null,
        holding_days:      holdingDays || null,
        fee:               hasSell ? totalFee         : null,
        tax:               hasSell ? tax              : null,
        net_profit_amount: hasSell ? netProfitAmount  : null,
        net_profit_rate:   hasSell ? netProfitRate    : null,
        sector,
        themes:            themes.length       > 0 ? themes        : null,
        trade_style:       tradeStyle,
        market_condition:  marketCondition,
        trade_grade:       tradeGrade || null,
        emotion_state:     emotionState || null,
        emotion_before:    emotionBefore.length > 0 ? emotionBefore : null,
        emotion_after:     emotionAfter.length  > 0 ? emotionAfter  : null,
        sell_reason:       sellReason || null,
        mistake_types:     mistakeTypes.length  > 0 ? mistakeTypes  : null,
        mistake_buy:       mistakeBuy.length    > 0 ? mistakeBuy    : null,
        mistake_sell:      mistakeSell.length   > 0 ? mistakeSell   : null,
        material_context:  data.material_context || null,
        entry_reason:      data.entry_reason     || null,
        stop_loss_plan:    data.stop_loss_plan   || null,
        trade_log:         data.trade_log        || null,
        reflection_good:   data.reflection_good  || null,
        reflection_bad:    data.reflection_bad   || null,
        reflection_next:   data.reflection_next  || null,
        news_links:        newsLinks.filter(l => l.trim() !== '') || null,
        chart_images:      uploadedPaths.length > 0 ? uploadedPaths : [],
      }

      const { error: dbError } = await supabase.from('trades').insert([payload])
      if (dbError) {
        setError('저장 중 오류가 발생했습니다: ' + dbError.message)
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => navigate('/journal'), 1500)
    } catch (err) {
      setError('오류가 발생했습니다: ' + err.message)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '80px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: '#16a34a' }}>매매 기록이 저장되었습니다!</h2>
        <p style={{ color: '#64748b' }}>매매일지로 이동합니다...</p>
      </div>
    )
  }

  return (
    <div>
      {/* 포커스 스타일 */}
      <style>{`
        .nt-input:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
          outline: none;
        }
      `}</style>

      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>
        ✏️ 새 매매 입력
      </h2>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>

          {/* ① 기본 거래 정보 */}
          <SectionTitle isMobile={isMobile}>① 기본 거래 정보</SectionTitle>
          <SectionBox>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              <div>
                <Label required isMobile={isMobile}>종목명</Label>
                <input className="nt-input" style={inputStyle}
                  {...register('stock_name', { required: '종목명을 입력하세요' })}
                  placeholder="예: 삼성전자" />
                {errors.stock_name && (
                  <p style={{ color: '#ef4444', fontSize: isMobile ? '14px' : '13px', marginTop: '2px' }}>
                    {errors.stock_name.message}
                  </p>
                )}
              </div>
              <div>
                <Label isMobile={isMobile}>시장 구분</Label>
                <MarketSelect value={market} onChange={setMarket} isMobile={isMobile} />
              </div>
              <div>
                <Label required isMobile={isMobile}>매수일</Label>
                <input type="date" className="nt-input" style={inputStyle}
                  {...register('buy_date', { required: true })} />
              </div>
              <div>
                <Label required isMobile={isMobile}>매수가 (원)</Label>
                <input
                  type="text" inputMode="numeric" className="nt-input" style={inputStyle}
                  placeholder="70,000"
                  value={buyPrice.display}
                  onChange={handleNumInput(setBuyPrice)}
                />
              </div>
              <div>
                <Label isMobile={isMobile}>매도일</Label>
                <input type="date" className="nt-input" style={inputStyle}
                  {...register('sell_date')} />
              </div>
              <div>
                <Label isMobile={isMobile}>매도가 (원)</Label>
                <input
                  type="text" inputMode="numeric" className="nt-input" style={inputStyle}
                  placeholder="75,000"
                  value={sellPrice.display}
                  onChange={handleNumInput(setSellPrice)}
                />
              </div>
              <div>
                <Label required isMobile={isMobile}>수량 (주)</Label>
                <input
                  type="text" inputMode="numeric" className="nt-input" style={inputStyle}
                  placeholder="100"
                  value={quantity.display}
                  onChange={handleNumInput(setQuantity)}
                />
              </div>
              <div>
                <Label isMobile={isMobile}>포지션 비중 (%)</Label>
                <input type="number" className="nt-input" style={inputStyle}
                  {...register('position_size')} placeholder="30" min="0" max="100" />
              </div>
            </div>
          </SectionBox>

          {/* 자동계산 미리보기 */}
          {hasSell && (
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: '8px', padding: '12px 16px', marginTop: '12px',
            }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span style={{ fontSize: isMobile ? '16px' : '14px', color: '#0369a1' }}>
                  💰 수익금: <strong style={{ color: profitAmount >= 0 ? '#2563eb' : '#dc2626' }}>
                    {profitAmount >= 0 ? '+' : ''}{profitAmount.toLocaleString()}원
                  </strong>
                </span>
                <span style={{ fontSize: isMobile ? '16px' : '14px', color: profitRate >= 0 ? '#2563eb' : '#dc2626' }}>
                  📈 수익률: <strong>{profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%</strong>
                </span>
                {holdingDays >= 0 && (
                  <span style={{ fontSize: isMobile ? '16px' : '14px', color: '#0369a1' }}>
                    📅 보유기간: <strong>{holdingDays}일</strong>
                  </span>
                )}
              </div>
              <div style={{ borderTop: '1px solid #bae6fd', paddingTop: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: isMobile ? '14px' : '13px', color: '#64748b' }}>
                  수수료: <strong>{totalFee.toLocaleString()}원</strong>
                  <span style={{ color: '#94a3b8', marginLeft: '4px' }}>
                    (매수 {buyFee.toLocaleString()} + 매도 {sellFee.toLocaleString()} + 세금 {tax.toLocaleString()})
                  </span>
                </span>
                <span style={{ fontSize: isMobile ? '14px' : '13px', color: netProfitAmount >= 0 ? '#2563eb' : '#dc2626', fontWeight: 600 }}>
                  순수익: {netProfitAmount >= 0 ? '+' : ''}{netProfitAmount.toLocaleString()}원
                  ({netProfitRate >= 0 ? '+' : ''}{netProfitRate.toFixed(2)}%)
                </span>
              </div>
            </div>
          )}

          {/* ② 분류 정보 */}
          <SectionTitle isMobile={isMobile}>② 분류 정보</SectionTitle>
          {optsLoading ? (
            <p style={{ color: '#94a3b8', fontSize: isMobile ? '16px' : '14px' }}>선택지 불러오는 중...</p>
          ) : (
            <SectionBox>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div>
                  <Label required isMobile={isMobile}>섹터</Label>
                  <select className="nt-input" style={selectStyle} value={sector} onChange={e => setSector(e.target.value)}>
                    <option value="">섹터 선택...</option>
                    {opts.sector.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label required isMobile={isMobile}>매매방식</Label>
                  <select className="nt-input" style={selectStyle} value={tradeStyle} onChange={e => setTradeStyle(e.target.value)}>
                    <option value="">매매방식 선택...</option>
                    {opts.trade_style.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label required isMobile={isMobile}>시장상황</Label>
                  <select className="nt-input" style={selectStyle} value={marketCondition} onChange={e => setMarketCondition(e.target.value)}>
                    <option value="">시장상황 선택...</option>
                    {opts.market_condition.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <Label isMobile={isMobile}>테마 (복수 선택)</Label>
                  <MultiSelect options={opts.theme} selected={themes} onChange={setThemes} color="#8b5cf6" isMobile={isMobile} />
                </div>
              </div>
            </SectionBox>
          )}

          {/* ③ 정성 평가 */}
          <SectionTitle isMobile={isMobile}>③ 정성 평가</SectionTitle>
          {optsLoading ? (
            <p style={{ color: '#94a3b8', fontSize: isMobile ? '16px' : '14px' }}>선택지 불러오는 중...</p>
          ) : (
            <SectionBox>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <Label isMobile={isMobile}>매매등급 (계획 대비 실행 품질)</Label>
                    <select
                      className="nt-input"
                      style={{ ...selectStyle, color: tradeGrade ? GRADE_COLORS[tradeGrade] : '#374151', fontWeight: tradeGrade ? 600 : 400 }}
                      value={tradeGrade} onChange={e => setTradeGrade(e.target.value)}
                    >
                      <option value="">등급 선택...</option>
                      {GRADES.map(g => (
                        <option key={g} value={g} style={{ color: GRADE_COLORS[g], fontWeight: 600 }}>{g}등급</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label isMobile={isMobile}>감정상태 (매매 중 전반적)</Label>
                    <select className="nt-input" style={selectStyle} value={emotionState} onChange={e => setEmotionState(e.target.value)}>
                      <option value="">감정상태 선택...</option>
                      {opts.emotion_before.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label isMobile={isMobile}>매도이유</Label>
                    <select className="nt-input" style={selectStyle} value={sellReason} onChange={e => setSellReason(e.target.value)}>
                      <option value="">매도이유 선택...</option>
                      {opts.sell_reason.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                {/* 감정 선택 */}
                <div style={{ background: '#ffffff', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <Label isMobile={isMobile}>매수 전 감정 (복수 선택)</Label>
                    <MultiSelect options={opts.emotion_before} selected={emotionBefore} onChange={setEmotionBefore} color="#f59e0b" isMobile={isMobile} />
                  </div>
                  <div>
                    <Label isMobile={isMobile}>매도 후 감정 (복수 선택)</Label>
                    <MultiSelect options={opts.emotion_after} selected={emotionAfter} onChange={setEmotionAfter} color="#10b981" isMobile={isMobile} />
                  </div>
                </div>

                {/* 실수 선택 */}
                <div style={{ background: '#ffffff', borderRadius: '8px', padding: '12px', border: '1px solid #fecaca' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <Label isMobile={isMobile}>실수유형 전체 (복수 선택)</Label>
                    <MultiSelect
                      options={[...new Set([...(opts.mistake_buy || []), ...(opts.mistake_sell || [])])]}
                      selected={mistakeTypes} onChange={setMistakeTypes} color="#ef4444" isMobile={isMobile}
                    />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <Label isMobile={isMobile}>매수 실수 (복수 선택)</Label>
                    <MultiSelect options={opts.mistake_buy || []} selected={mistakeBuy} onChange={setMistakeBuy} color="#dc2626" isMobile={isMobile} />
                  </div>
                  <div>
                    <Label isMobile={isMobile}>매도 실수 (복수 선택)</Label>
                    <MultiSelect options={opts.mistake_sell || []} selected={mistakeSell} onChange={setMistakeSell} color="#b91c1c" isMobile={isMobile} />
                  </div>
                </div>
              </div>
            </SectionBox>
          )}

          {/* ④ 서술 기록 */}
          <SectionTitle isMobile={isMobile}>④ 서술 기록</SectionTitle>
          <SectionBox>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { name: 'material_context', label: '재료 및 시장상황',     placeholder: '왜 이 종목이 움직였는지, 시장 상황은 어땠는지 기록하세요.' },
                { name: 'entry_reason',     label: '진입근거 (기술적 + 재료적)', placeholder: '차트 패턴, 거래량, 재료 등 진입 근거를 기록하세요.' },
                { name: 'stop_loss_plan',   label: '손절선 사전 설정',     placeholder: '진입 전 설정한 손절 기준을 기록하세요.' },
                { name: 'trade_log',        label: '대응 기록',            placeholder: '매매 중 어떻게 대응했는지 기록하세요.' },
              ].map(field => (
                <div key={field.name}>
                  <Label isMobile={isMobile}>{field.label}</Label>
                  <textarea className="nt-input"
                    style={{ ...inputStyle, minHeight: field.name === 'trade_log' ? '160px' : '80px', resize: 'vertical' }}
                    {...register(field.name)} placeholder={field.placeholder} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <Label isMobile={isMobile}>✅ 잘한 점</Label>
                  <textarea className="nt-input" style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    {...register('reflection_good')} placeholder="이번 매매에서 잘한 것은?" />
                </div>
                <div>
                  <Label isMobile={isMobile}>❌ 아쉬운 점</Label>
                  <textarea className="nt-input" style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    {...register('reflection_bad')} placeholder="아쉬웠거나 실수한 것은?" />
                </div>
                <div>
                  <Label isMobile={isMobile}>🔄 다음에는</Label>
                  <textarea className="nt-input" style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    {...register('reflection_next')} placeholder="다음에 같은 상황이 오면?" />
                </div>
              </div>
            </div>
          </SectionBox>

          {/* ⑤ 차트 이미지 */}
          <SectionTitle isMobile={isMobile}>⑤ 차트 이미지</SectionTitle>
          <SectionBox>
            {imagePreviews.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                {imagePreviews.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: '120px', height: '80px' }}>
                    <img src={url} alt={`차트 ${i + 1}`} style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                      borderRadius: '8px', border: '1px solid #bfdbfe',
                    }} />
                    <button type="button" onClick={() => removeImage(i)} style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      background: '#dc2626', color: '#fff', border: 'none',
                      borderRadius: '50%', width: '20px', height: '20px',
                      cursor: 'pointer', fontSize: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div {...getRootProps()} style={{
              border: `2px dashed ${isDragActive ? '#2563eb' : '#cbd5e1'}`,
              borderRadius: '12px', padding: '28px', textAlign: 'center', cursor: 'pointer',
              background: isDragActive ? '#eff6ff' : pasteHint ? '#f0fdf4' : '#ffffff',
              transition: 'all 0.2s',
            }}>
              <input {...getInputProps()} />
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>{pasteHint ? '✅' : '📸'}</div>
              {pasteHint ? (
                <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#16a34a', fontWeight: 600 }}>이미지가 붙여넣어졌습니다!</div>
              ) : (
                <>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#64748b' }}>
                    {isDragActive ? '여기에 놓으세요!' : '차트 이미지를 드래그하거나 클릭해서 추가'}
                  </div>
                  <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#94a3b8', marginTop: '4px' }}>
                    📋 차트 캡처 후 Ctrl+V 붙여넣기도 가능합니다
                  </div>
                </>
              )}
            </div>
          </SectionBox>

          {/* ⑥ 뉴스/공시 링크 */}
          <SectionTitle isMobile={isMobile}>⑥ 뉴스/공시 링크</SectionTitle>
          <SectionBox>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {newsLinks.map((link, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px' }}>
                  <input className="nt-input" style={{ ...inputStyle, flex: 1 }} value={link}
                    onChange={e => updateNewsLink(i, e.target.value)} placeholder="https://..." />
                  {newsLinks.length > 1 && (
                    <button type="button" onClick={() => removeNewsLink(i)} style={{
                      padding: '8px 12px', background: '#fee2e2',
                      border: '1px solid #fca5a5', borderRadius: '6px',
                      cursor: 'pointer', color: '#dc2626',
                      fontSize: isMobile ? '16px' : '14px',
                    }}>삭제</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addNewsLink} style={{
                alignSelf: 'flex-start', padding: '6px 12px', background: '#f1f5f9',
                border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer',
                fontSize: isMobile ? '16px' : '14px',
              }}>+ 링크 추가</button>
            </div>
          </SectionBox>

          {loading && imageFiles.length > 0 && (
            <div style={{
              marginTop: '16px', padding: '12px', background: '#eff6ff',
              border: '1px solid #bfdbfe', borderRadius: '8px',
              color: '#2563eb', fontSize: isMobile ? '16px' : '14px', textAlign: 'center',
            }}>
              🔄 이미지 업로드 중... ({imageFiles.length}개)
            </div>
          )}

          {error && (
            <div style={{
              marginTop: '16px', padding: '12px', background: '#fee2e2',
              border: '1px solid #fca5a5', borderRadius: '8px',
              color: '#dc2626', fontSize: isMobile ? '16px' : '14px',
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <button type="submit" disabled={loading} style={{
              padding: '10px 28px',
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: isMobile ? '16px' : '15px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              {loading ? (imageFiles.length > 0 ? '이미지 업로드 중...' : '저장 중...') : '💾 매매 저장'}
            </button>
            <button type="button" onClick={() => navigate('/journal')} style={{
              padding: '10px 20px', background: '#f1f5f9',
              border: '1px solid #cbd5e1', borderRadius: '8px',
              fontSize: isMobile ? '16px' : '15px', cursor: 'pointer',
            }}>취소</button>
          </div>

        </div>
      </form>
    </div>
  )
}