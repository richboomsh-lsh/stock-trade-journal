import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Settings as SettingsIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
};

const CATEGORIES = [
  { key: 'sector',          label: '섹터' },
  { key: 'theme',           label: '테마' },
  { key: 'trade_style',     label: '매매방식' },
  { key: 'market_condition',label: '시장상황' },
  { key: 'emotion_before',  label: '매수 전 감정' },
  { key: 'emotion_after',   label: '매수 후 감정' },
  { key: 'sell_reason',     label: '매도이유' },
  { key: 'mistake_buy',     label: '매수 실수' },
  { key: 'mistake_sell',    label: '매도 실수' },
];

export default function Settings() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // ── 자산·수수료 상태
  const [assetForm, setAssetForm] = useState({
    total_assets: '',
    buy_fee_rate: '',
    sell_fee_rate: '',
    tax_rate: '',
  });
  const [assetSaving, setAssetSaving] = useState(false);
  const [assetMsg, setAssetMsg] = useState(null); // { type: 'ok'|'err', text }

  // ── 드롭다운 상태
  const [activeTab, setActiveTab] = useState('sector');
  const [options, setOptions] = useState({}); // { sector: [{id,label,sort_order}, ...], ... }
  const [newLabel, setNewLabel] = useState('');
  const [optLoading, setOptLoading] = useState(false);
  const [optMsg, setOptMsg] = useState(null);

  // ── 초기 데이터 로드
  useEffect(() => {
    loadAssetSettings();
    loadAllOptions();
  }, []);

  async function loadAssetSettings() {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (data) {
      setAssetForm({
        total_assets: data.total_assets ?? '',
        buy_fee_rate: data.buy_fee_rate ?? '',
        sell_fee_rate: data.sell_fee_rate ?? '',
        tax_rate: data.tax_rate ?? '',
      });
    }
  }

  async function loadAllOptions() {
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('*')
      .order('category')
      .order('sort_order');
    if (data) {
      const grouped = {};
      CATEGORIES.forEach(c => { grouped[c.key] = []; });
      data.forEach(row => {
        if (grouped[row.category] !== undefined) {
          grouped[row.category].push(row);
        }
      });
      setOptions(grouped);
    }
  }

  // ── 자산 저장
  async function handleAssetSave() {
    setAssetSaving(true);
    setAssetMsg(null);
    const payload = {
      id: 1,
      total_assets: assetForm.total_assets === '' ? null : Number(assetForm.total_assets),
      buy_fee_rate: assetForm.buy_fee_rate === '' ? null : Number(assetForm.buy_fee_rate),
      sell_fee_rate: assetForm.sell_fee_rate === '' ? null : Number(assetForm.sell_fee_rate),
      tax_rate: assetForm.tax_rate === '' ? null : Number(assetForm.tax_rate),
    };
    const { error } = await supabase.from('app_settings').upsert(payload);
    setAssetSaving(false);
    if (error) {
      setAssetMsg({ type: 'err', text: '저장 실패: ' + error.message });
    } else {
      setAssetMsg({ type: 'ok', text: '✅ 저장되었습니다!' });
      setTimeout(() => setAssetMsg(null), 3000);
    }
  }

  // ── 드롭다운 항목 추가
  async function handleAddOption() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    setOptLoading(true);
    setOptMsg(null);
    const currentList = options[activeTab] || [];
    const maxOrder = currentList.length > 0
      ? Math.max(...currentList.map(o => o.sort_order || 0)) + 1
      : 0;
    const { data, error } = await supabase
      .from('dropdown_options')
      .insert({ category: activeTab, label: trimmed, sort_order: maxOrder })
      .select()
      .single();
    setOptLoading(false);
    if (error) {
      setOptMsg({ type: 'err', text: '추가 실패: ' + error.message });
    } else {
      setOptions(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), data],
      }));
      setNewLabel('');
      setOptMsg({ type: 'ok', text: '✅ 추가되었습니다!' });
      setTimeout(() => setOptMsg(null), 2000);
    }
  }

  // ── 드롭다운 항목 삭제
  async function handleDeleteOption(id) {
    setOptLoading(true);
    const { error } = await supabase.from('dropdown_options').delete().eq('id', id);
    setOptLoading(false);
    if (!error) {
      setOptions(prev => ({
        ...prev,
        [activeTab]: prev[activeTab].filter(o => o.id !== id),
      }));
    }
  }

  // ── 스타일 변수
  const cardStyle = {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    padding: isMobile ? '16px' : '24px',
    marginBottom: 20,
  };
  const labelStyle = {
    display: 'block',
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: 500,
  };
  const inputStyle = {
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    color: '#1e293b',
    boxSizing: 'border-box',
    outline: 'none',
  };
  const btnPrimary = {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
  const btnDanger = {
    background: 'none',
    border: 'none',
    color: '#dc2626',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
  };

  const currentCatLabel = CATEGORIES.find(c => c.key === activeTab)?.label || '';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: "'Noto Sans KR', sans-serif",
    }}>
      {/* 헤더 */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: isMobile ? '14px 16px' : '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748b', padding: 4 }}
        >
          <ArrowLeft size={20} />
        </button>
        <SettingsIcon size={20} color="#2563eb" />
        <span style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>설정</span>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '16px' : '24px' }}>

        {/* ── 섹션 1: 자산 및 수수료 설정 ── */}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
          💰 자산 및 수수료 설정
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>총 자산 (원)</label>
              <input
                type="number"
                style={inputStyle}
                value={assetForm.total_assets}
                onChange={e => setAssetForm(p => ({ ...p, total_assets: e.target.value }))}
                placeholder="예: 10000000"
              />
            </div>
            <div>
              <label style={labelStyle}>매수 수수료율</label>
              <input
                type="number"
                step="0.000001"
                style={inputStyle}
                value={assetForm.buy_fee_rate}
                onChange={e => setAssetForm(p => ({ ...p, buy_fee_rate: e.target.value }))}
                placeholder="예: 0.000150"
              />
            </div>
            <div>
              <label style={labelStyle}>매도 수수료율</label>
              <input
                type="number"
                step="0.000001"
                style={inputStyle}
                value={assetForm.sell_fee_rate}
                onChange={e => setAssetForm(p => ({ ...p, sell_fee_rate: e.target.value }))}
                placeholder="예: 0.000150"
              />
            </div>
            <div>
              <label style={labelStyle}>증권거래세율</label>
              <input
                type="number"
                step="0.000001"
                style={inputStyle}
                value={assetForm.tax_rate}
                onChange={e => setAssetForm(p => ({ ...p, tax_rate: e.target.value }))}
                placeholder="예: 0.001800"
              />
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button style={btnPrimary} onClick={handleAssetSave} disabled={assetSaving}>
              <Save size={15} />
              {assetSaving ? '저장 중...' : '저장'}
            </button>
            {assetMsg && (
              <span style={{ fontSize: 13, color: assetMsg.type === 'ok' ? '#16a34a' : '#dc2626' }}>
                {assetMsg.text}
              </span>
            )}
          </div>
        </div>

        {/* ── 섹션 2: 드롭다운 항목 관리 ── */}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
          🏷️ 드롭다운 항목 관리
        </div>
        <div style={cardStyle}>
          {/* 카테고리 탭 */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 16,
          }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => { setActiveTab(cat.key); setNewLabel(''); setOptMsg(null); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeTab === cat.key ? 700 : 400,
                  background: activeTab === cat.key ? '#2563eb' : '#f1f5f9',
                  color: activeTab === cat.key ? '#fff' : '#475569',
                  transition: 'all 0.15s',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 현재 카테고리 항목 목록 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
              📋 {currentCatLabel} 항목 ({(options[activeTab] || []).length}개)
            </div>
            {(options[activeTab] || []).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>
                등록된 항목이 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(options[activeTab] || []).map(opt => (
                  <div key={opt.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '8px 12px',
                  }}>
                    <span style={{ fontSize: 14, color: '#1e293b' }}>{opt.label}</span>
                    <button
                      style={btnDanger}
                      onClick={() => handleDeleteOption(opt.id)}
                      disabled={optLoading}
                      title="삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 항목 추가 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              style={{ ...inputStyle, flex: 1 }}
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder={`새 ${currentCatLabel} 항목 입력`}
              onKeyDown={e => { if (e.key === 'Enter') handleAddOption(); }}
            />
            <button
              style={{ ...btnPrimary, whiteSpace: 'nowrap' }}
              onClick={handleAddOption}
              disabled={optLoading || !newLabel.trim()}
            >
              <Plus size={15} />
              추가
            </button>
          </div>
          {optMsg && (
            <div style={{ marginTop: 8, fontSize: 13, color: optMsg.type === 'ok' ? '#16a34a' : '#dc2626' }}>
              {optMsg.text}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}