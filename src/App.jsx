import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function App() {
  const [status, setStatus] = useState('연결 중...')

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { data, error } = await supabase.from('_test').select('*').limit(1)
        console.log('error code:', error?.code)
        // 404 또는 어떤 응답이든 오면 Supabase와 통신 성공
        setStatus('✅ 연결 성공!')
      } catch (err) {
        setStatus('❌ 연결 실패: ' + err.message)
      }
    }
    testConnection()
  }, [])

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>📈 주식 매매일지</h1>
      <p>Supabase 연결 상태: {status}</p>
    </div>
  )
}

export default App