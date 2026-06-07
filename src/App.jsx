import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import NewTrade from './pages/NewTrade'
import TradeJournal from './pages/TradeJournal'
import Stats from './pages/Stats'
import TradeDetail from './pages/TradeDetail'
import EditTrade from './pages/EditTrade'

function Navbar() {
  const location = useLocation()
  const links = [
    { to: '/', label: '홈' },
    { to: '/new', label: '+ 매매 입력' },
    { to: '/journal', label: '매매일지' },
    { to: '/stats', label: '통계' },
  ]
  return (
    <nav style={{
      background: '#1e293b', padding: '0 24px',
      display: 'flex', alignItems: 'center', gap: '8px',
      height: '56px', position: 'sticky', top: 0, zIndex: 100,
    }}>
      <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '18px', marginRight: '16px' }}>
        📈 매매일지
      </span>
      {links.map(link => (
        <Link key={link.to} to={link.to} style={{
          color: location.pathname === link.to ? '#60a5fa' : '#94a3b8',
          textDecoration: 'none', padding: '6px 14px', borderRadius: '6px',
          fontSize: '14px', fontWeight: location.pathname === link.to ? 600 : 400,
          background: location.pathname === link.to ? 'rgba(96,165,250,0.1)' : 'transparent',
        }}>{link.label}</Link>
      ))}
    </nav>
  )
}

export default function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Navbar />
        <main style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<NewTrade />} />
            <Route path="/journal" element={<TradeJournal />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/trade/:id" element={<TradeDetail />} />
            <Route path="/edit/:id" element={<EditTrade />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}