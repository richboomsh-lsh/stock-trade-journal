import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { calcProfitAmount, calcProfitRate, calcHoldingDays } from '../lib/tradeHelpers'

const SECTORS = ['에너지', '반도체', '바이오', '금융', '소비재', '화학', '철강', '건설', '운송', '기타']
const THEMES = ['전쟁', '금리', '정책', 'AI', '반도체', '바이오', '환율', '원자재', '기타']
const TRADE_STYLES = ['눌림목', '상한가따라잡기', '돌파매수', '역추세', '스캘핑', '기타']
const MARKET_CONDITIONS = ['상승장', '하락장', '횡보장']
const GRADES = ['A', 'B', 'C', 'D']
const EMOTIONS = ['냉정', '불안', '과신', 'FOMO', '조급함', '기타']
const SELL_REASONS = ['손절', '목표가도달', '시간손절', '재료소멸', '충동매도']
const MISTAKE_TYPES = ['늦은진입', '이른매도', '손절미이행', '과도한비중', '충동매수', '기타']

function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontSize: '15px', fontWeight: 600, color: '#1e293b',
      borderLeft: '3px solid #3b82f6', paddingLeft: '10px',
      margin: '28px 0 16px',
    }}>
      {children}
    </h3>
  )
}

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>
      {children}
      {required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
    </label>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
  borderRadius: '6px', fontSize: '14px', outline: 'none',
  boxSizing: 'border-box', background: '#fff',
}

function MultiSelect({ options, selected, onChange, color = '#3b82f6' }) {
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
          fontSize: '13px', cursor: 'pointer',
        }}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function SingleSelect({ options, value, onChange, colorMap }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map(opt => {
        const activeColor = colorMap ? colorMap[opt] : '#3b82f6'
        const isSelected = value === opt
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)} style={{
            padding: '5px 14px', borderRadius: '6px',
            border: `1px solid ${isSelected ? activeColor : '#d1d5db'}`,
            background: isSelected ? activeColor : '#f9fafb',
            color: isSelected ? '#fff' : '#374151',
            fontSize: '13px', cursor: 'pointer', fontWeight: isSelected ? 600 : 400,
          }}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export default function NewTrade() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [themes, setThemes] = useState([])
  const [mistakeTypes, setMistakeTypes] = useState([])
  const [newsLinks, setNewsLinks] = useState([''])
  const [sector, setSector] = useState('')
  const [tradeStyle, setTradeStyle] = useState('')
  const [marketCondition, setMarketCondition] = useState('')
  const [tradeGrade, setTradeGrade] = useState('')
  const [emotionState, setEmotionState] = useState('')
  const [sellReason, setSellReason] = useState('')

  // ✅ 이미지 관련 상태
  const [imageFiles, setImageFiles] = useState([])       // 업로드할 File 객체들
  const [imagePreviews, setImagePreviews] = useState([]) // 미리보기 URL들
  const [pasteHint, setPasteHint] = useState(false)      // 붙여넣기 안내 표시

  const { register, handleSubmit, watch, formState: { errors } } = useForm()

  const watchBuyPrice = watch('buy_price')
  const watchSellPrice = watch('sell_price')
  const watchQuantity = watch('quantity')
  const watchBuyDate = watch('buy_date')
  const watchSellDate = watch('sell_date')

  const profitAmount = calcProfitAmount(Number(watchBuyPrice), Number(watchSellPrice), Number(watchQuantity))
  const profitRate = calcProfitRate(Number(watchBuyPrice), Number(watchSellPrice))
  const holdingDays = calcHoldingDays(watchBuyDate, watchSellDate)

  // ✅ 이미지 추가 공통 함수
  const addImages = useCallback((files) => {
    const imageOnly = files.filter(f => f.type.startsWith('image/'))
    if (imageOnly.length === 0) return
    setImageFiles(prev => [...prev, ...imageOnly])
    const previews = imageOnly.map(f => URL.createObjectURL(f))
    setImagePreviews(prev => [...prev, ...previews])
  }, [])

  // ✅ 드래그앤드롭
  const onDrop = useCallback((acceptedFiles) => {
    addImages(acceptedFiles)
  }, [addImages])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
  })

  // ✅ 붙여넣기(Ctrl+V) 이벤트 리스너
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return

      const files = imageItems.map(item => item.getAsFile()).filter(Boolean)
      // 붙여넣기 이미지는 파일명이 없으므로 이름 지정
      const namedFiles = files.map((file, i) => {
        const ext = file.type.split('/')[1] || 'png'
        return new File([file], `paste_${Date.now()}_${i}.${ext}`, { type: file.type })
      })
      addImages(namedFiles)

      // 붙여넣기 성공 안내 표시
      setPasteHint(true)
      setTimeout(() => setPasteHint(false), 2000)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addImages])

  // ✅ 이미지 제거
  const removeImage = (index) => {
    URL.revokeObjectURL(imagePreviews[index])
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const addNewsLink = () => setNewsLinks([...newsLinks, ''])
  const removeNewsLink = (i) => setNewsLinks(newsLinks.filter((_, idx) => idx !== i))
  const updateNewsLink = (i, val) => {
    const updated = [...newsLinks]
    updated[i] = val
    setNewsLinks(updated)
  }

  const onSubmit = async (data) => {
    setLoading(true)
    setError('')
    if (!sector) { setError('섹터를 선택해 주세요.'); setLoading(false); return }
    if (!tradeStyle) { setError('매매방식을 선택해 주세요.'); setLoading(false); return }
    if (!marketCondition) { setError('시장상황을 선택해 주세요.'); setLoading(false); return }

    try {
      // ✅ 1. 이미지 Supabase Storage에 업로드
      const uploadedPaths = []
      for (const file of imageFiles) {
        const ext = file.name.split('.').pop() || 'png'
        const path = `charts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('chart-images')
          .upload(path, file)
        if (uploadError) {
          console.error('이미지 업로드 실패:', uploadError.message)
          // 이미지 업로드 실패해도 저장은 계속 진행 (선택사항)
        } else {
          uploadedPaths.push(path)
        }
      }

      // ✅ 2. DB에 저장
      const payload = {
        stock_name: data.stock_name,
        buy_date: data.buy_date,
        buy_price: Number(data.buy_price),
        sell_date: data.sell_date || null,
        sell_price: data.sell_price ? Number(data.sell_price) : null,
        quantity: Number(data.quantity),
        position_size: data.position_size ? Number(data.position_size) : null,
        profit_amount: profitAmount || null,
        profit_rate: profitRate || null,
        holding_days: holdingDays || null,
        sector,
        themes: themes.length > 0 ? themes : null,
        trade_style: tradeStyle,
        market_condition: marketCondition,
        trade_grade: tradeGrade || null,
        emotion_state: emotionState || null,
        sell_reason: sellReason || null,
        mistake_types: mistakeTypes.length > 0 ? mistakeTypes : null,
        material_context: data.material_context || null,
        entry_reason: data.entry_reason || null,
        stop_loss_plan: data.stop_loss_plan || null,
        response_record: data.response_record || null,
        reflection_good: data.reflection_good || null,
        reflection_bad: data.reflection_bad || null,
        reflection_next: data.reflection_next || null,
        news_links: newsLinks.filter(l => l.trim() !== '') || null,
        chart_images: uploadedPaths.length > 0 ? uploadedPaths : [],
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
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>
        ✏️ 새 매매 입력
      </h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>

          <SectionTitle>① 기본 거래 정보</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div>
              <Label required>종목명</Label>
              <input style={inputStyle} {...register('stock_name', { required: '종목명을 입력하세요' })} placeholder="예: 삼성전자" />
              {errors.stock_name && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '2px' }}>{errors.stock_name.message}</p>}
            </div>
            <div>
              <Label required>매수일</Label>
              <input type="date" style={inputStyle} {...register('buy_date', { required: true })} />
            </div>
            <div>
              <Label required>매수가 (원)</Label>
              <input type="number" style={inputStyle} {...register('buy_price', { required: true })} placeholder="70000" />
            </div>
            <div>
              <Label>매도일</Label>
              <input type="date" style={inputStyle} {...register('sell_date')} />
            </div>
            <div>
              <Label>매도가 (원)</Label>
              <input type="number" style={inputStyle} {...register('sell_price')} placeholder="75000" />
            </div>
            <div>
              <Label required>수량 (주)</Label>
              <input type="number" style={inputStyle} {...register('quantity', { required: true })} placeholder="100" />
            </div>
            <div>
              <Label>포지션 비중 (%)</Label>
              <input type="number" style={inputStyle} {...register('position_size')} placeholder="30" min="0" max="100" />
            </div>
          </div>

          {(watchBuyPrice && watchSellPrice && watchQuantity) && (
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: '8px', padding: '12px 16px', marginTop: '12px',
              display: 'flex', gap: '24px', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '13px', color: '#0369a1' }}>
                💰 수익금: <strong>{profitAmount >= 0 ? '+' : ''}{profitAmount.toLocaleString()}원</strong>
              </span>
              <span style={{ fontSize: '13px', color: profitRate >= 0 ? '#2563eb' : '#dc2626' }}>
                📈 수익률: <strong>{profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%</strong>
              </span>
              {holdingDays >= 0 && (
                <span style={{ fontSize: '13px', color: '#0369a1' }}>
                  📅 보유기간: <strong>{holdingDays}일</strong>
                </span>
              )}
            </div>
          )}

          <SectionTitle>② 분류 정보</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <Label required>섹터</Label>
              <SingleSelect options={SECTORS} value={sector} onChange={setSector} />
            </div>
            <div>
              <Label>테마 (복수 선택 가능)</Label>
              <MultiSelect options={THEMES} selected={themes} onChange={setThemes} color="#8b5cf6" />
            </div>
            <div>
              <Label required>매매방식</Label>
              <SingleSelect options={TRADE_STYLES} value={tradeStyle} onChange={setTradeStyle} />
            </div>
            <div>
              <Label required>시장상황</Label>
              <SingleSelect options={MARKET_CONDITIONS} value={marketCondition} onChange={setMarketCondition}
                colorMap={{ '상승장': '#2563eb', '하락장': '#dc2626', '횡보장': '#6b7280' }} />
            </div>
          </div>

          <SectionTitle>③ 정성 평가</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <Label>매매등급 (계획 대비 실행 품질)</Label>
              <SingleSelect options={GRADES} value={tradeGrade} onChange={setTradeGrade}
                colorMap={{ A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#dc2626' }} />
            </div>
            <div>
              <Label>감정상태</Label>
              <SingleSelect options={EMOTIONS} value={emotionState} onChange={setEmotionState} />
            </div>
            <div>
              <Label>매도이유</Label>
              <SingleSelect options={SELL_REASONS} value={sellReason} onChange={setSellReason} />
            </div>
            <div>
              <Label>실수유형 (복수 선택 가능)</Label>
              <MultiSelect options={MISTAKE_TYPES} selected={mistakeTypes} onChange={setMistakeTypes} color="#ef4444" />
            </div>
          </div>

          <SectionTitle>④ 서술 기록</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { name: 'material_context', label: '재료 및 시장상황', placeholder: '왜 이 종목이 움직였는지, 시장 상황은 어땠는지 기록하세요.' },
              { name: 'entry_reason', label: '진입근거 (기술적 + 재료적)', placeholder: '차트 패턴, 거래량, 재료 등 진입 근거를 기록하세요.' },
              { name: 'stop_loss_plan', label: '손절선 사전 설정', placeholder: '진입 전 설정한 손절 기준을 기록하세요.' },
              { name: 'response_record', label: '대응 기록', placeholder: '매매 중 어떻게 대응했는지 기록하세요.' },
            ].map(field => (
              <div key={field.name}>
                <Label>{field.label}</Label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  {...register(field.name)} placeholder={field.placeholder} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <Label>✅ 잘한 점</Label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  {...register('reflection_good')} placeholder="이번 매매에서 잘한 것은?" />
              </div>
              <div>
                <Label>❌ 아쉬운 점</Label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  {...register('reflection_bad')} placeholder="아쉬웠거나 실수한 것은?" />
              </div>
              <div>
                <Label>🔄 다음에는</Label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  {...register('reflection_next')} placeholder="다음에 같은 상황이 오면?" />
              </div>
            </div>
          </div>

          {/* ✅ 차트 이미지 섹션 */}
          <SectionTitle>⑤ 차트 이미지</SectionTitle>

          {/* 미리보기 */}
          {imagePreviews.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              {imagePreviews.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: '120px', height: '80px' }}>
                  <img src={url} alt={`차트 ${i + 1}`} style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    borderRadius: '8px', border: '1px solid #bfdbfe',
                  }} />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      background: '#dc2626', color: '#fff', border: 'none',
                      borderRadius: '50%', width: '20px', height: '20px',
                      cursor: 'pointer', fontSize: '12px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* 드래그앤드롭 영역 */}
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? '#2563eb' : '#cbd5e1'}`,
              borderRadius: '12px', padding: '28px', textAlign: 'center',
              cursor: 'pointer',
              background: isDragActive ? '#eff6ff' : pasteHint ? '#f0fdf4' : '#f8fafc',
              transition: 'all 0.2s',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>
              {pasteHint ? '✅' : '📸'}
            </div>
            {pasteHint ? (
              <div style={{ fontSize: '14px', color: '#16a34a', fontWeight: 600 }}>
                이미지가 붙여넣어졌습니다!
              </div>
            ) : (
              <>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {isDragActive
                    ? '여기에 놓으세요!'
                    : '차트 이미지를 드래그하거나 클릭해서 추가'}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  📋 차트 캡처 후 Ctrl+V 붙여넣기도 가능합니다
                </div>
              </>
            )}
          </div>

          <SectionTitle>⑥ 뉴스/공시 링크</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {newsLinks.map((link, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px' }}>
                <input style={{ ...inputStyle, flex: 1 }} value={link}
                  onChange={e => updateNewsLink(i, e.target.value)} placeholder="https://..." />
                {newsLinks.length > 1 && (
                  <button type="button" onClick={() => removeNewsLink(i)} style={{
                    padding: '8px 12px', background: '#fee2e2',
                    border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', color: '#dc2626',
                  }}>삭제</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addNewsLink} style={{
              alignSelf: 'flex-start', padding: '6px 12px', background: '#f1f5f9',
              border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
            }}>+ 링크 추가</button>
          </div>

          {loading && imageFiles.length > 0 && (
            <div style={{
              marginTop: '16px', padding: '12px', background: '#eff6ff',
              border: '1px solid #bfdbfe', borderRadius: '8px',
              color: '#2563eb', fontSize: '14px', textAlign: 'center',
            }}>
              🔄 이미지 업로드 중... ({imageFiles.length}개)
            </div>
          )}

          {error && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '14px' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <button type="submit" disabled={loading} style={{
              padding: '10px 28px',
              background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '15px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              {loading ? (imageFiles.length > 0 ? '이미지 업로드 중...' : '저장 중...') : '💾 매매 저장'}
            </button>
            <button type="button" onClick={() => navigate('/journal')} style={{
              padding: '10px 20px', background: '#f1f5f9',
              border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', cursor: 'pointer',
            }}>취소</button>
          </div>

        </div>
      </form>
    </div>
  )
}