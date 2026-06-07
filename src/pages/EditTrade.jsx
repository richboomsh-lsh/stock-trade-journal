import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { calcProfitAmount, calcProfitRate, calcHoldingDays } from '../lib/tradeHelpers'

const SECTORS = ['에너지', '반도체', '바이오', '금융', '소비재', '화학', '철강', '건설', '운송', '기타']
const TRADE_STYLES = ['눌림목', '상한가따라잡기', '돌파매수', '역추세', '스캘핑', '기타']
const MARKET_CONDITIONS = ['상승장', '하락장', '횡보장']
const GRADES = ['A', 'B', 'C', 'D']
const EMOTIONS = ['냉정', '불안', '과신', 'FOMO', '희망', '후회']
const SELL_REASONS = ['손절', '목표가도달', '시간손절', '재료소멸', '충동매도']
const MISTAKE_TYPES = ['늦은진입', '이른매도', '손절미이행', '과도한비중', '뇌동매매', '기타']
const THEMES = ['전쟁', '금리', '정책', 'AI', '반도체', '바이오', '환율', '원자재', '실적', '기타']

const label = (text, required) => (
  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>
    {text}{required && <span style={{ color: '#dc2626' }}> *</span>}
  </label>
)

const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
  borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', background: '#fff',
}

const textareaStyle = {
  ...inputStyle, resize: 'vertical', minHeight: '80px', lineHeight: '1.6', fontFamily: 'inherit',
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#64748b', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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

function TagSelector({ options, selected, onChange, color = '#2563eb' }) {
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
            padding: '4px 12px', borderRadius: '20px', fontSize: '14px', cursor: 'pointer',
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
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [themes, setThemes] = useState([])
  const [mistakeTypes, setMistakeTypes] = useState([])

  // 이미지 관련
  const [existingImages, setExistingImages] = useState([])   // Supabase에 이미 저장된 경로
  const [existingUrls, setExistingUrls] = useState([])       // 화면에 보여줄 URL
  const [removedImages, setRemovedImages] = useState([])     // 삭제할 경로
  const [newFiles, setNewFiles] = useState([])               // 새로 추가할 파일
  const [newPreviews, setNewPreviews] = useState([])         // 새 파일 미리보기
  const [uploadProgress, setUploadProgress] = useState(false)
  const [pasteHint, setPasteHint] = useState(false)          // ✅ 붙여넣기 성공 안내

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

  useEffect(() => {
    fetchTrade()
  }, [id])

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
      'trade_grade', 'emotion_state', 'sell_reason',
      'material_context', 'entry_reason', 'stop_loss_plan', 'response_record',
      'reflection_good', 'reflection_bad', 'reflection_next',
    ]
    fields.forEach(f => setValue(f, data[f] || ''))
    setThemes(data.themes || [])
    setMistakeTypes(data.mistake_types || [])

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

  // ✅ 새 이미지 추가 공통 함수 (드래그앤드롭 + 붙여넣기 공유)
  const addNewImages = useCallback((files) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    setNewFiles(prev => [...prev, ...imageFiles])
    const previews = imageFiles.map(f => URL.createObjectURL(f))
    setNewPreviews(prev => [...prev, ...previews])
  }, [])

  // 드래그앤드롭
  const onDrop = useCallback((acceptedFiles) => {
    addNewImages(acceptedFiles)
  }, [addNewImages])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [] }, multiple: true,
  })

  // ✅ 붙여넣기(Ctrl+V) 이벤트 리스너
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

  // 기존 이미지 삭제 표시
  const removeExisting = (index) => {
    setRemovedImages(prev => [...prev, existingImages[index]])
    setExistingImages(prev => prev.filter((_, i) => i !== index))
    setExistingUrls(prev => prev.filter((_, i) => i !== index))
  }

  // 새 이미지 제거
  const removeNew = (index) => {
    URL.revokeObjectURL(newPreviews[index])
    setNewFiles(prev => prev.filter((_, i) => i !== index))
    setNewPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const onSubmit = async (formData) => {
    setSaving(true)
    setUploadProgress(true)

    try {
      // 1. 삭제 표시된 기존 이미지 제거
      if (removedImages.length > 0) {
        await supabase.storage.from('chart-images').remove(removedImages)
      }

      // 2. 새 이미지 업로드
      const uploadedPaths = []
      for (const file of newFiles) {
        const ext = file.name.split('.').pop() || 'png'
        const path = `charts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('chart-images').upload(path, file)
        if (!error) uploadedPaths.push(path)
      }

      const finalImagePaths = [...existingImages, ...uploadedPaths]

      // 3. 뉴스 링크
      const newsLinks = [0, 1, 2]
        .map(i => formData[`news_link_${i}`])
        .filter(l => l && l.trim())

      // 4. DB 업데이트
      const payload = {
        stock_name: formData.stock_name,
        buy_date: formData.buy_date,
        buy_price: Number(formData.buy_price),
        sell_date: formData.sell_date || null,
        sell_price: formData.sell_price ? Number(formData.sell_price) : null,
        quantity: formData.quantity ? Number(formData.quantity) : null,
        position_size: formData.position_size ? Number(formData.position_size) : null,
        profit_amount: profitAmount,
        profit_rate: profitRate,
        holding_days: holdingDays,
        sector: formData.sector || null,
        themes: themes.length > 0 ? themes : null,
        trade_style: formData.trade_style || null,
        market_condition: formData.market_condition || null,
        trade_grade: formData.trade_grade || null,
        emotion_state: formData.emotion_state || null,
        sell_reason: formData.sell_reason || null,
        mistake_types: mistakeTypes.length > 0 ? mistakeTypes : null,
        material_context: formData.material_context || null,
        entry_reason: formData.entry_reason || null,
        stop_loss_plan: formData.stop_loss_plan || null,
        response_record: formData.response_record || null,
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
          borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#475569',
        }}>← 뒤로</button>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>✏️ 매매 수정</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>

        {(profitRate !== null) && (
          <div style={{
            background: profitRate >= 0 ? '#eff6ff' : '#fef2f2',
            border: `1px solid ${profitRate >= 0 ? '#bfdbfe' : '#fecaca'}`,
            borderRadius: '12px', padding: '16px', marginBottom: '16px',
            display: 'flex', gap: '24px', flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>수익률 (자동계산)</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: profitRate >= 0 ? '#2563eb' : '#dc2626' }}>
                {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
              </div>
            </div>
            {profitAmount !== null && (
              <div>
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>수익금 (자동계산)</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: profitRate >= 0 ? '#2563eb' : '#dc2626' }}>
                  {profitAmount >= 0 ? '+' : ''}{Math.round(profitAmount).toLocaleString()}원
                </div>
              </div>
            )}
            {holdingDays !== null && (
              <div>
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>보유기간</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{holdingDays}일</div>
              </div>
            )}
          </div>
        )}

        {/* 기본 거래 정보 */}
        <Section title="기본 거래 정보">
          <div style={{ marginBottom: '12px' }}>
            {label('종목명', true)}
            <input {...register('stock_name', { required: '종목명을 입력해주세요' })}
              style={{ ...inputStyle, borderColor: errors.stock_name ? '#dc2626' : '#d1d5db' }}
              placeholder="예: 삼성전자" />
            {errors.stock_name && <p style={{ color: '#dc2626', fontSize: '14px', marginTop: '4px' }}>{errors.stock_name.message}</p>}
          </div>
          <Row>
            <div>
              {label('매수일', true)}
              <input type="date" {...register('buy_date', { required: true })} style={inputStyle} />
            </div>
            <div>
              {label('매수가 (원)', true)}
              <input type="number" {...register('buy_price', { required: true })} style={inputStyle} placeholder="0" />
            </div>
          </Row>
          <Row>
            <div>
              {label('매도일')}
              <input type="date" {...register('sell_date')} style={inputStyle} />
            </div>
            <div>
              {label('매도가 (원)')}
              <input type="number" {...register('sell_price')} style={inputStyle} placeholder="0" />
            </div>
          </Row>
          <Row>
            <div>
              {label('수량 (주)')}
              <input type="number" {...register('quantity')} style={inputStyle} placeholder="0" />
            </div>
            <div>
              {label('포지션 비중 (%)')}
              <input type="number" {...register('position_size')} style={inputStyle} placeholder="0~100" min="0" max="100" />
            </div>
          </Row>
        </Section>

        {/* 분류 정보 */}
        <Section title="분류 정보">
          <Row>
            <div>
              {label('섹터')}
              <select {...register('sector')} style={inputStyle}>
                <option value="">선택</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              {label('매매방식')}
              <select {...register('trade_style')} style={inputStyle}>
                <option value="">선택</option>
                {TRADE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </Row>
          <div style={{ marginBottom: '12px' }}>
            {label('시장상황')}
            <select {...register('market_condition')} style={inputStyle}>
              <option value="">선택</option>
              {MARKET_CONDITIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            {label('테마 (복수 선택 가능)')}
            <TagSelector options={THEMES} selected={themes} onChange={setThemes} color="#7c3aed" />
          </div>
        </Section>

        {/* 정성 평가 */}
        <Section title="정성 평가">
          <Row cols={2}>
            <div>
              {label('매매등급')}
              <select {...register('trade_grade')} style={inputStyle}>
                <option value="">선택</option>
                {GRADES.map(g => <option key={g} value={g}>등급 {g}</option>)}
              </select>
            </div>
            <div>
              {label('감정상태')}
              <select {...register('emotion_state')} style={inputStyle}>
                <option value="">선택</option>
                {EMOTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </Row>
          <div style={{ marginBottom: '12px' }}>
            {label('매도이유')}
            <select {...register('sell_reason')} style={inputStyle}>
              <option value="">선택</option>
              {SELL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            {label('실수유형 (복수 선택 가능)')}
            <TagSelector options={MISTAKE_TYPES} selected={mistakeTypes} onChange={setMistakeTypes} color="#dc2626" />
          </div>
        </Section>

        {/* 서술 정보 */}
        <Section title="매매 근거">
          <div style={{ marginBottom: '12px' }}>
            {label('재료 및 시장상황')}
            <textarea {...register('material_context')} style={textareaStyle} placeholder="어떤 재료(뉴스/공시/테마)로 진입했는지 기록하세요" />
          </div>
          <div style={{ marginBottom: '12px' }}>
            {label('진입근거')}
            <textarea {...register('entry_reason')} style={textareaStyle} placeholder="기술적/재료적 진입 근거를 기록하세요" />
          </div>
          <div style={{ marginBottom: '12px' }}>
            {label('손절선 사전 설정')}
            <textarea {...register('stop_loss_plan')} style={{ ...textareaStyle, minHeight: '60px' }} placeholder="진입 전 설정한 손절가/손절 조건" />
          </div>
          <div>
            {label('대응 기록')}
            <textarea {...register('response_record')} style={textareaStyle} placeholder="매매 중 어떻게 대응했는지 기록하세요" />
          </div>
        </Section>

        {/* 성찰 */}
        <Section title="성찰">
          <div style={{ marginBottom: '12px' }}>
            {label('✅ 잘한 점')}
            <textarea {...register('reflection_good')} style={textareaStyle} placeholder="이번 매매에서 잘한 점은?" />
          </div>
          <div style={{ marginBottom: '12px' }}>
            {label('❌ 아쉬운 점')}
            <textarea {...register('reflection_bad')} style={textareaStyle} placeholder="아쉬웠던 점, 실수한 점은?" />
          </div>
          <div>
            {label('💡 다음에는')}
            <textarea {...register('reflection_next')} style={textareaStyle} placeholder="다음 번에 어떻게 개선할 것인지?" />
          </div>
        </Section>

        {/* 차트 이미지 */}
        <Section title="차트 이미지">

          {/* 기존 이미지 */}
          {existingUrls.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>기존 이미지</div>
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
                      cursor: 'pointer', fontSize: '14px', lineHeight: '20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 새 이미지 미리보기 */}
          {newPreviews.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>새로 추가할 이미지</div>
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

          {/* 드래그앤드롭 + 붙여넣기 영역 */}
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
              <div style={{ fontSize: '14px', color: '#16a34a', fontWeight: 600 }}>
                이미지가 붙여넣어졌습니다!
              </div>
            ) : (
              <>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {isDragActive ? '여기에 놓으세요!' : '차트 이미지를 드래그하거나 클릭해서 추가하세요'}
                </div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
                  📋 차트 캡처 후 Ctrl+V 붙여넣기도 가능합니다 · JPG, PNG, GIF 지원
                </div>
              </>
            )}
          </div>
        </Section>

        {/* 뉴스 링크 */}
        <Section title="뉴스 / 공시 링크">
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
            borderRadius: '8px', fontSize: '15px', cursor: 'pointer', color: '#374151',
          }}>취소</button>
          <button type="submit" disabled={saving} style={{
            padding: '10px 32px', background: saving ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: '8px',
            fontSize: '15px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? (uploadProgress ? '이미지 업로드 중...' : '저장 중...') : '💾 저장하기'}
          </button>
        </div>
      </form>
    </div>
  )
}