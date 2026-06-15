import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ReviewStart() {
  const navigate = useNavigate()
  const [selectedFilter, setSelectedFilter] = useState('random')
  const [selectedStyle, setSelectedStyle] = useState('')
  const [tradeStyles, setTradeStyles] = useState([])
  const [loadingStyles, setLoadingStyles] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // 매매방식 목록 불러오기 (매매방식별 복기 선택 시)
  useEffect(() => {
    if (selectedFilter === 'style') {
      setLoadingStyles(true)
      supabase
        .from('dropdown_options')
        .select('label')
        .eq('category', 'trade_style')
        .order('sort_order', { ascending: true })
        .then(({ data }) => {
          setTradeStyles(data ? data.map(d => d.label) : [])
          setLoadingStyles(false)
        })
    }
  }, [selectedFilter])

  const filters = [
    {
      key: 'random',
      emoji: '🎲',
      label: '랜덤 복기',
      desc: '전체 완료 거래 중 무작위로',
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      key: 'loss',
      emoji: '📉',
      label: '손실 복기',
      desc: '손실이 난 거래만 집중적으로',
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      key: 'profit',
      emoji: '📈',
      label: '수익 복기',
      desc: '수익이 난 거래만 복기',
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
    },
    {
      key: 'style',
      emoji: '🎯',
      label: '매매방식별 복기',
      desc: '특정 매매방식 거래만 선택',
      color: '#7c3aed',
      bg: '#faf5ff',
      border: '#e9d5ff',
    },
  ]

  function handleStart() {
    if (selectedFilter === 'style' && !selectedStyle) return
    navigate('/review/session', {
      state: {
        filter: selectedFilter,
        style: selectedFilter === 'style' ? selectedStyle : null,
      },
    })
  }

  const canStart = selectedFilter !== 'style' || selectedStyle !== ''

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', paddingTop: '24px' }}>

      {/* 헤더 */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔄</div>
        <h1 style={{ fontSize: isMobile ? '22px' : '24px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
          복기 모드
        </h1>
        <p style={{ fontSize: isMobile ? '15px' : '14px', color: '#64748b' }}>
          어떤 매매를 복기할까요?
        </p>
      </div>

      {/* 필터 카드 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {filters.map(f => {
          const isSelected = selectedFilter === f.key
          return (
            <div
              key={f.key}
              onClick={() => { setSelectedFilter(f.key); setSelectedStyle('') }}
              style={{
                background: isSelected ? f.bg : '#fff',
                border: `2px solid ${isSelected ? f.color : '#e2e8f0'}`,
                borderRadius: '12px',
                padding: '16px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* 라디오 */}
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                border: `2px solid ${isSelected ? f.color : '#cbd5e1'}`,
                background: isSelected ? f.color : '#fff',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSelected && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
                )}
              </div>

              {/* 이모지 */}
              <span style={{ fontSize: '24px', flexShrink: 0 }}>{f.emoji}</span>

              {/* 텍스트 */}
              <div>
                <div style={{
                  fontWeight: 600,
                  fontSize: isMobile ? '16px' : '15px',
                  color: isSelected ? f.color : '#1e293b',
                  marginBottom: '2px',
                }}>
                  {f.label}
                </div>
                <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#94a3b8' }}>
                  {f.desc}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 매매방식 선택 (매매방식별 복기 선택 시에만 표시) */}
      {selectedFilter === 'style' && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px',
        }}>
          <div style={{
            fontSize: isMobile ? '15px' : '14px',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '12px',
          }}>
            매매방식 선택
          </div>
          {loadingStyles ? (
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>불러오는 중...</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {tradeStyles.map(style => {
                const isActive = selectedStyle === style
                return (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(style)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '20px',
                      border: `1.5px solid ${isActive ? '#7c3aed' : '#d1d5db'}`,
                      background: isActive ? '#7c3aed' : '#fff',
                      color: isActive ? '#fff' : '#374151',
                      fontSize: isMobile ? '15px' : '14px',
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {style}
                  </button>
                )
              })}
              {tradeStyles.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '14px' }}>
                  설정에서 매매방식 항목을 추가해 주세요.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 복기 시작 버튼 */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: '12px',
          border: 'none',
          background: canStart ? '#2563eb' : '#e2e8f0',
          color: canStart ? '#fff' : '#94a3b8',
          fontSize: isMobile ? '17px' : '16px',
          fontWeight: 700,
          cursor: canStart ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s',
        }}
      >
        복기 시작 →
      </button>

      {/* 뒤로가기 */}
      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none',
            color: '#94a3b8', fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          ← 홈으로
        </button>
      </div>

    </div>
  )
}