import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import NewTrade from './pages/NewTrade'
import TradeJournal from './pages/TradeJournal'
import Stats from './pages/Stats'
import TradeDetail from './pages/TradeDetail'
import EditTrade from './pages/EditTrade'
import Settings from './pages/Settings'
import Login from './pages/Login'
import ReviewStart from './pages/ReviewStart'
import ReviewSession from './pages/ReviewSession'
import ExportTrend from './pages/ExportTrend'

function Navbar({ onLogout }) {
  const location = useLocation()
  const links = [
    { to: '/', label: '홈' },
    { to: '/new', label: '+ 매매' },
    { to: '/journal', label: '매매일지' },
    { to: '/stats', label: '통계' },
    { to: '/export-trend', label: '수출동향' },
    { to: '/settings', label: '설정' },
  ]
  return (
    <nav style={{
      background: '#1e293b',
      display: 'flex', alignItems: 'center',
      height: '52px', position: 'sticky', top: 0, zIndex: 100,
      padding: '0 12px', gap: '8px',
    }}>
      <span style={{
        color: '#60a5fa', fontWeight: 700, fontSize: '16px',
        marginRight: '4px', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        📈 매매일지
      </span>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        overflowX: 'auto', flex: 1,
      }}>
        {links.map(link => (
          <Link key={link.to} to={link.to} style={{
            color: location.pathname === link.to ? '#60a5fa' : '#94a3b8',
            textDecoration: 'none',
            padding: '6px 10px', borderRadius: '6px',
            fontSize: '13px',
            fontWeight: location.pathname === link.to ? 600 : 400,
            background: location.pathname === link.to ? 'rgba(96,165,250,0.1)' : 'transparent',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>{link.label}</Link>
        ))}
      </div>

      <button
        onClick={onLogout}
        style={{
          background: 'transparent',
          border: '1px solid #475569',
          color: '#94a3b8',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '13px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        로그아웃
      </button>
    </nav>
  )
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session)
      setCheckingSession(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthenticated(!!session)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  function handleLogin() {
    setAuthenticated(true)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (checkingSession) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        color: '#64748b',
        fontSize: '14px',
      }}>
        불러오는 중...
      </div>
    )
  }

  return (
    <>
      <style>{`
        input, textarea, select {
          color: #1e293b !important;
          background-color: #ffffff !important;
          -webkit-text-fill-color: #1e293b !important;
          opacity: 1 !important;
        }
        input::placeholder, textarea::placeholder {
          color: #94a3b8 !important;
          -webkit-text-fill-color: #94a3b8 !important;
          opacity: 1 !important;
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        textarea:-webkit-autofill,
        select:-webkit-autofill {
          -webkit-text-fill-color: #1e293b !important;
          -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
        }
      `}</style>

      {!authenticated ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Router>
          <div style={{
            minHeight: '100vh',
            background: '#f8fafc',
            color: '#1e293b',
            colorScheme: 'light',
          }}>
            <Navbar onLogout={handleLogout} />
            <main style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 14px' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/new" element={<NewTrade />} />
                <Route path="/journal" element={<TradeJournal />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/export-trend" element={<ExportTrend />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/trade/:id" element={<TradeDetail />} />
                <Route path="/edit/:id" element={<EditTrade />} />
                <Route path="/review" element={<ReviewStart />} />
                <Route path="/review/session" element={<ReviewSession />} />
              </Routes>
            </main>
          </div>
        </Router>
      )}
    </>
  )
}