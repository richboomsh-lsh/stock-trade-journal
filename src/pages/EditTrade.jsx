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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function Section({ title, children, isMobile }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
      <h3 style={{
        fontSize: isMobile ? '16px' : '14px',
        fontWeight: 700, color: '#64748b', marginBottom: '16px',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px', marginBottom: '12px' }}>
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
            padding: '4px 12px', borderRadius: '20px',
            fontSize: isMobile ? '16px' : '14px', cursor: 'pointer',
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
  const [feeSettings, setFeeSettings] = useState({ buy_fee_rate: 0.015, sell_fee_rate: 0.015, tax_rate: 0.2 })

  const [existingImages, setExistingImages] = useState([])
  const [existingUrls, setExistingUrls] = useState([])
  const [removedImages, setRemovedImages] = useState([])
  const [newFiles, setNewFiles] = useState([])
  const [newPreviews, setNewPreviews] = useState([])
  const [uploadProgress, setUploadProgress] = useState(false)
  const [pasteHint, setPasteHint] = useState(false)

  // 반응형 인라인 스타일
  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: isMobile ? '16px' : '14px',
    boxSizing: 'border-box', background: '#fff',
  }
  const textareaStyle = {
    ...inputStyle, resize: 'vertical', minHeight: '80px', lineHeight: '1.6', fontFamily: 'inherit',
  }

  // label 렌더 함수 (isMobile 클로저 캡처)
  const labelEl = (text, required) => (
    <label style={{ display: 'block', fontSize: isMobile ? '16px' : '14px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
      {text}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
  )

  const buyPrice = watch('buy_price')
  const sellPrice = watch('sell_price')
  const quantity = watch('quantity')
  const buyDate = watch('buy_date')
  const sellDate = watch('sell_date')

  const profitAmount = buyPrice && sellPrice && quantity
    ? calcProfitAmount(Number(buyPrice), Number(sellPrice), Number(quantity)) : null
  const profitRate = buyPrice && sellPrice
    ? calcProfitRate(Number(buyPrice), Number(sellPrice)) : null
  const holdingDays = buyDate && sellDate
    ? calcHoldingDays(buyDate, sellDate) : null

  const fee = (buyPrice && sellPrice && quantity)
    ? Math.round(
        Number(buyPrice) * Number(quantity) * (feeSettings.buy_fee_rate / 100) +
        Number(sellPrice) * Number(quantity) * (feeSettings.sell_fee_rate / 100)
      )
    : null

  const tax = (sellPrice && quantity && profitAmount !== null && profitAmount > 0)
    ? Math.round(profitAmount * (feeSettings.tax_rate / 100))
    : null

  const netProfitAmount = (profitAmount !== null && fee !== null)
    ? profitAmount - fee - (tax || 0)
    : null

  const netProfitRate = (netProfitAmount !== null && buyPrice && quantity)
    ? (netProfitAmount / (Number(buyPrice) * Number(quantity))) * 100
    : null

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
    data.forEach(row => {
      if (!grouped[row.category]) grouped[row.category] = []
      if (!grouped[row.category].includes(row.label)) {
        grouped[row.category] = [...grouped[row.category], row.label]
      }
    })

    const categories = [...new Set(data.map(r => r.category))]
    categories.forEach(cat => {
      grouped[cat] = data.filter(r => r.category === cat).map(r => r.label)
    })

    setOptions(grouped)
  }

  const loadFeeSettings = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('buy_fee_rate, sell_fee_rate, tax_rate')
      .eq('id', 1)
      .single()

    if (!error && data) {
      setFeeSettings({
        buy_fee_rate: Number(data.buy_fee_rate) || 0.015,
        sell_fee_rate: Number(data.sell_fee_rate) || 0.015,
        tax_rate: Number(data.tax_rate) || 0.2,
      })
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
      'stock_name', 'buy_date', 'buy_price', 'sell_date', 'sell_price',
      'quantity', 'position_size', 'sector', 'trade_style', 'market_condition',
      'trade_grade', 'sell_reason',
      'material_context', 'entry_reason', 'stop_loss_plan', 'trade_log',
      'reflection_good', 'reflection_bad', 'reflection_next',
    ]
    fields.forEach(f => setValue(f, data[f] || ''))

    setMarket(data.market || '')
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

  const onDrop = useCallback((acceptedFiles) => {
    addNewImages(acceptedFiles)
  }, [addNewImages])

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

      const payload = {
        stock_name: formData.stock_name,
        market: market || null,
        buy_date: formData.buy_date,
        buy_price: Number(formData.buy_price),
        sell_date: formData.sell_date || null,
        sell_price: formData.sell_price ? Number(formData.sell_price) : null,
        quantity: formData.quantity ? Number(formData.quantity) : null,
        position_size: formData.position_size ? Number(formData.position_size) : null,
        profit_amount: profitAmount,
        profit_rate: profitRate,
        holding_days: holdingDays,
        fee: fee,
        tax: tax,
        net_profit_amount: netProfitAmount !== null ? Math.round(netProfitAmount) : null,
        net_profit_rate: netProfitRate !== null ? parseFloat(netProfitRate.toFixed(4)) : null,
        sector: formData.sector || null,
        themes: themes.length > 0 ? themes : null,
        trade_style: formData.trade_style || null,
        market_condition: formData.market_condition || null,
        trade_grade: formData.trade_grade || null,
        emotion_before: emotionBefore.length > 0 ? emotionBefore : null,
        emotion_after: emotionAfter.length > 0 ? emotionAfter : null,
        sell_reason: formData.sell_reason || null,
        mistake_buy: mistakeBuy.length > 0 ? mistakeBuy : null,
        mistake_sell: mistakeSell.length > 0 ? mistakeSell : null,
        material_context: formData.material_context || null,
        entry_reason: formData.entry_reason || null,
        stop_loss_plan: formData.stop_loss_plan || null,
        trade_log: formData.trade_log || null,
        reflection_good: formData.reflection_good || null,
        reflection_bad: formData.reflection_bad || null,
        reflection_next: formData.reflection_next || null,
        chart_images: finalImagePaths.length > 0 ? finalImagePaths : null,
        news_links: newsLinks.length > 0 ? newsLinks : null,
        updated_at: new Date().toISOString(),
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{
          padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: '8px', cursor: 'pointer',
          fontSize: isMobile ? '16px' : '14px', color: '#475569',
        }}>← 뒤로</button>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>✏️ 매매 수정</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* 자동계산 미리보기 카드 */}
        {(profitRate !== null) && (
          <div style={{
            background: profitRate >= 0 ? '#eff6ff' : '#fef2f2',
            border: `1px solid ${profitRate >= 0 ? '#bfdbfe' : '#fecaca'}`,
            borderRadius: '12px', padding: '16px', marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: netProfitAmount !== null ? '12px' : 0 }}>
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수익률</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: profitRate >= 0 ? '#2563eb' : '#dc2626' }}>
                  {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
                </div>
              </div>
              {profitAmount !== null && (
                <div>
                  <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수익금</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: profitRate >= 0 ? '#2563eb' : '#dc2626' }}>
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

            {netProfitAmount !== null && (
              <div style={{
                display: 'flex', gap: '16px', flexWrap: 'wrap',
                paddingTop: '12px', borderTop: '1px solid #e2e8f0',
              }}>
                <div>
                  <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>수수료</div>
                  <div style={{ fontSize: isMobile ? '16px' : '15px', fontWeight: 600, color: '#dc2626' }}>
                    -{fee !== null ? fee.toLocaleString() : 0}원
                  </div>
                </div>
                {tax !== null && tax > 0 && (
                  <div>
                    <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>세금</div>
                    <div style={{ fontSize: isMobile ? '16px' : '15px', fontWeight: 600, color: '#dc2626' }}>
                      -{tax.toLocaleString()}원
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>순수익금</div>
                  <div style={{ fontSize: isMobile ? '16px' : '15px', fontWeight: 700, color: netProfitAmount >= 0 ? '#2563eb' : '#dc2626' }}>
                    {netProfitAmount >= 0 ? '+' : ''}{Math.round(netProfitAmount).toLocaleString()}원
                  </div>
                </div>
                {netProfitRate !== null && (
                  <div>
                    <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>순수익률</div>
                    <div style={{ fontSize: isMobile ? '16px' : '15px', fontWeight: 700, color: netProfitRate >= 0 ? '#2563eb' : '#dc2626' }}>
                      {netProfitRate >= 0 ? '+' : ''}{netProfitRate.toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 기본 거래 정보 */}
        <Section title="기본 거래 정보" isMobile={isMobile}>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('종목명', true)}
            <input {...register('stock_name', { required: '종목명을 입력해주세요' })}
              style={{ ...inputStyle, borderColor: errors.stock_name ? '#dc2626' : '#d1d5db' }}
              placeholder="예: 삼성전자" />
            {errors.stock_name && <p style={{ color: '#dc2626', fontSize: isMobile ? '16px' : '14px', marginTop: '4px' }}>{errors.stock_name.message}</p>}
          </div>

          {/* 시장 구분 */}
          <div style={{ marginBottom: '12px' }}>
            {labelEl('시장 구분')}
            <div style={{ display: 'flex', gap: '8px' }}>
              {['코스피', '코스닥'].map(m => (
                <button key={m} type="button" onClick={() => setMarket(market === m ? '' : m)} style={{
                  padding: '7px 20px', borderRadius: '8px',
                  fontSize: isMobile ? '16px' : '14px', cursor: 'pointer',
                  fontWeight: market === m ? 700 : 400,
                  background: market === m ? '#1e293b' : '#f8fafc',
                  color: market === m ? '#fff' : '#64748b',
                  border: `1px solid ${market === m ? '#1e293b' : '#e2e8f0'}`,
                  transition: 'all 0.15s',
                }}>{m}</button>
              ))}
            </div>
          </div>

          <Row>
            <div>
              {labelEl('매수일', true)}
              <input type="date" {...register('buy_date', { required: true })} style={inputStyle} />
            </div>
            <div>
              {labelEl('매수가 (원)', true)}
              <input type="number" {...register('buy_price', { required: true })} style={inputStyle} placeholder="0" />
            </div>
          </Row>
          <Row>
            <div>
              {labelEl('매도일')}
              <input type="date" {...register('sell_date')} style={inputStyle} />
            </div>
            <div>
              {labelEl('매도가 (원)')}
              <input type="number" {...register('sell_price')} style={inputStyle} placeholder="0" />
            </div>
          </Row>
          <Row>
            <div>
              {labelEl('수량 (주)')}
              <input type="number" {...register('quantity')} style={inputStyle} placeholder="0" />
            </div>
            <div>
              {labelEl('포지션 비중 (%)')}
              <input type="number" {...register('position_size')} style={inputStyle} placeholder="0~100" min="0" max="100" />
            </div>
          </Row>
        </Section>

        {/* 분류 정보 */}
        <Section title="분류 정보" isMobile={isMobile}>
          <Row>
            <div>
              {labelEl('섹터')}
              <select {...register('sector')} style={inputStyle}>
                <option value="">선택</option>
                {options.sector.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              {labelEl('매매방식')}
              <select {...register('trade_style')} style={inputStyle}>
                <option value="">선택</option>
                {options.trade_style.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </Row>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('시장상황')}
            <select {...register('market_condition')} style={inputStyle}>
              <option value="">선택</option>
              {options.market_condition.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            {labelEl('테마 (복수 선택 가능)')}
            <TagSelector options={options.theme} selected={themes} onChange={setThemes} color="#7c3aed" isMobile={isMobile} />
          </div>
        </Section>

        {/* 정성 평가 */}
        <Section title="정성 평가" isMobile={isMobile}>
          <Row cols={2}>
            <div>
              {labelEl('매매등급')}
              <select {...register('trade_grade')} style={inputStyle}>
                <option value="">선택</option>
                {GRADES.map(g => <option key={g} value={g}>등급 {g}</option>)}
              </select>
            </div>
            <div>
              {labelEl('매도이유')}
              <select {...register('sell_reason')} style={inputStyle}>
                <option value="">선택</option>
                {options.sell_reason.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </Row>

          <div style={{ marginBottom: '12px' }}>
            {labelEl('매수 전 감정 (복수 선택 가능)')}
            <TagSelector options={options.emotion_before} selected={emotionBefore} onChange={setEmotionBefore} color="#f59e0b" isMobile={isMobile} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            {labelEl('매도 후 감정 (복수 선택 가능)')}
            <TagSelector options={options.emotion_after} selected={emotionAfter} onChange={setEmotionAfter} color="#8b5cf6" isMobile={isMobile} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            {labelEl('매수 실수 (복수 선택 가능)')}
            <TagSelector options={options.mistake_buy} selected={mistakeBuy} onChange={setMistakeBuy} color="#dc2626" isMobile={isMobile} />
          </div>

          <div>
            {labelEl('매도 실수 (복수 선택 가능)')}
            <TagSelector options={options.mistake_sell} selected={mistakeSell} onChange={setMistakeSell} color="#ea580c" isMobile={isMobile} />
          </div>
        </Section>

        {/* 매매 근거 */}
        <Section title="매매 근거" isMobile={isMobile}>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('재료 및 시장상황')}
            <textarea {...register('material_context')} style={textareaStyle} placeholder="어떤 재료(뉴스/공시/테마)로 진입했는지 기록하세요" />
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('진입근거')}
            <textarea {...register('entry_reason')} style={textareaStyle} placeholder="기술적/재료적 진입 근거를 기록하세요" />
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('손절선 사전 설정')}
            <textarea {...register('stop_loss_plan')} style={{ ...textareaStyle, minHeight: '60px' }} placeholder="진입 전 설정한 손절가/손절 조건" />
          </div>
          <div>
            {labelEl('대응 기록')}
            <textarea {...register('trade_log')} style={textareaStyle} placeholder="매매 중 어떻게 대응했는지 기록하세요" />
          </div>
        </Section>

        {/* 성찰 */}
        <Section title="성찰" isMobile={isMobile}>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('✅ 잘한 점')}
            <textarea {...register('reflection_good')} style={textareaStyle} placeholder="이번 매매에서 잘한 점은?" />
          </div>
          <div style={{ marginBottom: '12px' }}>
            {labelEl('❌ 아쉬운 점')}
            <textarea {...register('reflection_bad')} style={textareaStyle} placeholder="아쉬웠던 점, 실수한 점은?" />
          </div>
          <div>
            {labelEl('💡 다음에는')}
            <textarea {...register('reflection_next')} style={textareaStyle} placeholder="다음 번에 어떻게 개선할 것인지?" />
          </div>
        </Section>

        {/* 차트 이미지 */}
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
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>
              {pasteHint ? '✅' : '📸'}
            </div>
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

        {/* 뉴스 링크 */}
        <Section title="뉴스 / 공시 링크" isMobile={isMobile}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ marginBottom: '8px' }}>
              <input {...register(`news_link_${i}`)} style={inputStyle}
                placeholder={`링크 ${i + 1} (https://...)`} type="url" />
            </div>
          ))}
        </Section>

        {/* 저장 버튼 */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button type="button" onClick={() => navigate(-1)} style={{
            padding: '10px 24px', background: '#fff', border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: isMobile ? '16px' : '15px',
            cursor: 'pointer', color: '#374151',
          }}>취소</button>
          <button type="submit" disabled={saving} style={{
            padding: '10px 32px', background: saving ? '#93c5fd' : '#2563eb',
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