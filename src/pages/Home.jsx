import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div style={{ textAlign: 'center', paddingTop: '40px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
        📈 주식 매매일지
      </h1>
      <p style={{ color: '#64748b', fontSize: '16px', marginBottom: '48px' }}>
        나의 매매를 기록하고, 성장하세요.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        maxWidth: '640px',
        margin: '0 auto',
      }}>
        <Link to="/new" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', cursor: 'pointer' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✏️</div>
            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>새 매매 입력</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>오늘의 매매를 기록</div>
          </div>
        </Link>
        <Link to="/journal" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', cursor: 'pointer' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>매매일지 보기</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>전체 거래 기록</div>
          </div>
        </Link>
        <Link to="/stats" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', cursor: 'pointer' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>통계 대시보드</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>나의 매매 분석</div>
          </div>
        </Link>
        <Link to="/settings" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', cursor: 'pointer' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚙️</div>
            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>설정</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>자산·수수료·항목 관리</div>
          </div>
        </Link>
        <Link to="/review" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', cursor: 'pointer' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔄</div>
            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>복기 모드</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>과거 매매 단계적 복기</div>
          </div>
        </Link>
      </div>
    </div>
  )
}