import { useState } from 'react'
import { supabase } from '../lib/supabase'

const AUTH_EMAIL = import.meta.env.VITE_AUTH_EMAIL

export default function Login({ onLogin }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isMobile] = useState(window.innerWidth <= 640)

  async function handleSubmit() {
    if (!input || loading) return
    setLoading(true)
    setError(false)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: AUTH_EMAIL,
      password: input,
    })

    setLoading(false)

    if (authError) {
      setError(true)
      setInput('')
      setTimeout(() => setError(false), 2000)
      return
    }

    onLogin()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      padding: '24px',
    }}>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: isMobile ? '32px 24px' : '48px 40px',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>

        <div style={{
          fontSize: isMobile ? '20px' : '18px',
          fontWeight: 700,
          color: '#1e293b',
          marginBottom: '6px',
        }}>
          주식 매매일지
        </div>
        <div style={{
          fontSize: isMobile ? '15px' : '14px',
          color: '#64748b',
          marginBottom: '32px',
        }}>
          비밀번호를 입력하세요
        </div>

        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="비밀번호"
          autoFocus
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: isMobile ? '16px' : '15px',
            border: error ? '1.5px solid #dc2626' : '1.5px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: '12px',
            background: '#fff',
            color: '#1e293b',
            transition: 'border-color 0.15s',
          }}
        />

        <div style={{
          fontSize: '14px',
          color: '#dc2626',
          minHeight: '20px',
          marginBottom: '16px',
        }}>
          {error ? '비밀번호가 올바르지 않습니다' : ''}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: isMobile ? '16px' : '15px',
            fontWeight: 600,
            background: loading ? '#93c5fd' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '확인 중...' : '입장하기'}
        </button>
      </div>
    </div>
  )
}