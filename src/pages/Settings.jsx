import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, Settings as SettingsIcon, RefreshCw } from 'lucide-react';
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
  { key: 'sector',           label: '섹터' },
  { key: 'theme',            label: '테마' },
  { key: 'trade_style',      label: '매매방식' },
  { key: 'market_condition', label: '시장상황' },
  { key: 'emotion_before',   label: '매수 전 감정' },
  { key: 'emotion_after',    label: '매도 후 감정' },
  { key: 'sell_reason',      label: '매도이유' },
  { key: 'mistake_buy',      label: '매수 실수' },
  { key: 'mistake_sell',     label: '매도 실수' },
];

// ── 천단위 콤마 헬퍼
function toDisplay(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const n = Number(raw);
  if (isNaN(n)) return '';
  return n.toLocaleString();
}
function fromDisplay(str) {
  return str.replace(/,/g, '');
}

// ── DB 저장값(소수) → 화면 표시값(%) 변환
//    0.00015  →  "0.015"
//    0.0018   →  "0.18"
function rateToDisplay(dbVal) {
  if (dbVal === '' || dbVal === null || dbVal === undefined) return '';
  // 소수점 6자리까지 반올림해서 부동소수점 오차 제거
  const pct = Math.round(Number(dbVal) * 100 * 1000000) / 1000000;
  return String(pct);
}

// ── 화면 입력값(%) → DB 저장값(소수) 변환
//    "0.015"  →  0.00015
//    "0.18"   →  0.0018
function rateFromDisplay(str) {
  if (str === '' || str === null) return null;
  const pct = parseFloat(str);
  if (isNaN(pct)) return null;
  return Math.round(pct / 100 * 1000000) / 1000000;
}

export default function Settings() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // ── 자산·수수료 상태 (화면 표시용 — % 단위, 총자산은 콤마 포함 문자열)
  const [totalAssetsDisplay, setTotalAssetsDisplay] = useState(''); // 콤마 포함 문자열
  const [totalAssetsRaw, setTotalAssetsRaw]         = useState(''); // 순수 숫자 문자열
  const [buyFeeDisplay, setBuyFeeDisplay]           = useState(''); // % 단위 문자열
  const [sellFeeDisplay, setSellFeeDisplay]         = useState(''); // % 단위 문자열
  const [taxDisplay, setTaxDisplay]                 = useState(''); // % 단위 문자열

  const [assetSaving, setAssetSaving] = useState(false);
  const [assetMsg, setAssetMsg]       = useState(null); // { type: 'ok'|'err'|'info', text }

  // ── 드롭다운 상태
  const [activeTab, setActiveTab] = useState('sector');
  const [options, setOptions]     = useState({});
  const [newLabel, setNewLabel]   = useState('');
  const [optLoading, setOptLoading] = useState(false);
  const [optMsg, setOptMsg]         = useState(null);

  // ── 초기 데이터 로드
  useEffect(() => {
    loadAssetSettings();
    loadAllOptions();
  }, []);

  async function loadAssetSettings() {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (data) {
      const raw = String(data.total_assets ?? '');
      setTotalAssetsRaw(raw);
      setTotalAssetsDisplay(raw === '' ? '' : Number(raw).toLocaleString());
      setBuyFeeDisplay(rateToDisplay(data.buy_fee_rate));
      setSellFeeDisplay(rateToDisplay(data.sell_fee_rate));
      setTaxDisplay(rateToDisplay(data.tax_rate));
    }
  }

  async function loadAllOptions() {
    const { data } = await supabase
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

  // ── 총 자산 입력 핸들러 (천단위 콤마)
  function handleTotalAssetsChange(e) {
    const raw = fromDisplay(e.target.value);
    if (raw === '' || /^\d+$/.test(raw)) {
      setTotalAssetsRaw(raw);
      setTotalAssetsDisplay(raw === '' ? '' : Number(raw).toLocaleString());
    }
  }

  // ── 저장 + 기존 거래 재계산
  async function handleAssetSave() {
    setAssetSaving(true);
    setAssetMsg({ type: 'info', text: '⏳ 저장 및 수수료 재계산 중...' });

    const buyFeeRate  = rateFromDisplay(buyFeeDisplay);
    const sellFeeRate = rateFromDisplay(sellFeeDisplay);
    const taxRate     = rateFromDisplay(taxDisplay);
    const totalAssets = totalAssetsRaw === '' ? null : Number(totalAssetsRaw);

    // 1) app_settings 저장
    const { error: settingsError } = await supabase
      .from('app_settings')
      .upsert({
        id: 1,
        total_assets:  totalAssets,
        buy_fee_rate:  buyFeeRate,
        sell_fee_rate: sellFeeRate,
        tax_rate:      taxRate,
      });

    if (settingsError) {
      setAssetSaving(false);
      setAssetMsg({ type: 'err', text: '저장 실패: ' + settingsError.message });
      return;
    }

    // 2) 완료된 거래 전체 재계산 (sell_price가 있는 것만)
    if (buyFeeRate !== null && sellFeeRate !== null && taxRate !== null) {
      const { data: trades, error: fetchError } = await supabase
        .from('trades')
        .select('id, buy_price, sell_price, quantity, profit_amount')
        .not('sell_price', 'is', null)
        .not('buy_price', 'is', null)
        .not('quantity', 'is', null);

      if (!fetchError && trades && trades.length > 0) {
        const updates = trades.map(t => {
          const bp  = Number(t.buy_price);
          const sp  = Number(t.sell_price);
          const qty = Number(t.quantity);

          const profitAmount = (sp - bp) * qty;
          const fee = Math.round((bp * qty * buyFeeRate + sp * qty * sellFeeRate) * 100) / 100;
          const tax = Math.round(sp * qty * taxRate * 100) / 100;
          const netProfitAmount = Math.round((profitAmount - fee - tax) * 100) / 100;
          const netProfitRate   = bp > 0
            ? Math.round(netProfitAmount / (bp * qty) * 100 * 10000) / 10000
            : 0;

          return {
            id: t.id,
            fee,
            tax,
            net_profit_amount: netProfitAmount,
            net_profit_rate:   netProfitRate,
          };
        });

        // 개별 update (upsert는 NOT NULL 컬럼 충돌 위험)
        const results = await Promise.all(
          updates.map(u =>
            supabase
              .from('trades')
              .update({
                fee:               u.fee,
                tax:               u.tax,
                net_profit_amount: u.net_profit_amount,
                net_profit_rate:   u.net_profit_rate,
              })
              .eq('id', u.id)
          )
        );

        const updateError = results.find(r => r.error)?.error;
        if (updateError) {
          setAssetSaving(false);
          setAssetMsg({ type: 'err', text: '수수료 재계산 업데이트 실패: ' + updateError.message });
          return;
        }

        setAssetSaving(false);
        setAssetMsg({
          type: 'ok',
          text: `✅ 저장 완료! 기존 매매 ${trades.length}건 수수료·세금 재계산 완료`,
        });
      } else {
        setAssetSaving(false);
        setAssetMsg({ type: 'ok', text: '✅ 설정이 저장되었습니다.' });
      }
    } else {
      setAssetSaving(false);
      setAssetMsg({ type: 'ok', text: '✅ 설정이 저장되었습니다.' });
    }

    setTimeout(() => setAssetMsg(null), 5000);
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

  // ── 스타일
  const cardStyle = {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    padding: isMobile ? '16px' : '24px',
    marginBottom: 20,
  };
  const labelStyle = {
    display: 'block',
    fontSize: isMobile ? '14px' : '13px',
    color: '#64748b',
    marginBottom: 4,
    fontWeight: 500,
  };
  const inputStyle = {
    width: '100%',
    border: '1.5px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: isMobile ? '16px' : '14px',
    color: '#1e293b',
    boxSizing: 'border-box',
    outline: 'none',
    background: '#fff',
  };
  // 수수료율 입력 — 오른쪽에 % 단위 표시를 위한 래퍼
  const rateWrapStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  };
  const rateInputStyle = {
    ...inputStyle,
    paddingRight: '36px', // % 표시 공간
  };
  const rateSuffixStyle = {
    position: 'absolute',
    right: '12px',
    color: '#64748b',
    fontSize: isMobile ? '15px' : '13px',
    fontWeight: 600,
    pointerEvents: 'none',
    userSelect: 'none',
  };
  const btnPrimary = {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: isMobile ? '16px' : '14px',
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

        {/* 안내 박스 */}
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 14,
          fontSize: isMobile ? '14px' : '13px',
          color: '#1d4ed8',
          lineHeight: 1.6,
        }}>
          <strong>수수료율 입력 안내</strong><br />
          키움증권 기준: 매수·매도 수수료율 <strong>0.015%</strong>, 증권거래세 <strong>0.18%</strong><br />
          → % 숫자 그대로 입력하세요. (예: 0.015 입력 = 0.015% 적용)
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>

            {/* 총 자산 */}
            <div>
              <label style={labelStyle}>총 자산 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                style={inputStyle}
                value={totalAssetsDisplay}
                onChange={handleTotalAssetsChange}
                placeholder="예: 40,000,000"
              />
            </div>

            {/* 매수 수수료율 */}
            <div>
              <label style={labelStyle}>매수 수수료율 (%)</label>
              <div style={rateWrapStyle}>
                <input
                  type="number"
                  step="0.001"
                  style={rateInputStyle}
                  value={buyFeeDisplay}
                  onChange={e => setBuyFeeDisplay(e.target.value)}
                  placeholder="예: 0.015"
                />
                <span style={rateSuffixStyle}>%</span>
              </div>
            </div>

            {/* 매도 수수료율 */}
            <div>
              <label style={labelStyle}>매도 수수료율 (%)</label>
              <div style={rateWrapStyle}>
                <input
                  type="number"
                  step="0.001"
                  style={rateInputStyle}
                  value={sellFeeDisplay}
                  onChange={e => setSellFeeDisplay(e.target.value)}
                  placeholder="예: 0.015"
                />
                <span style={rateSuffixStyle}>%</span>
              </div>
            </div>

            {/* 증권거래세율 */}
            <div>
              <label style={labelStyle}>증권거래세율 (%)</label>
              <div style={rateWrapStyle}>
                <input
                  type="number"
                  step="0.001"
                  style={rateInputStyle}
                  value={taxDisplay}
                  onChange={e => setTaxDisplay(e.target.value)}
                  placeholder="예: 0.18"
                />
                <span style={rateSuffixStyle}>%</span>
              </div>
            </div>

          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button style={btnPrimary} onClick={handleAssetSave} disabled={assetSaving}>
              {assetSaving
                ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> 재계산 중...</>
                : <><Save size={15} /> 저장 및 수수료 재계산</>
              }
            </button>
            {assetMsg && (
              <span style={{
                fontSize: isMobile ? '14px' : '13px',
                color: assetMsg.type === 'ok' ? '#16a34a'
                     : assetMsg.type === 'info' ? '#2563eb'
                     : '#dc2626',
                fontWeight: 500,
              }}>
                {assetMsg.text}
              </span>
            )}
          </div>

          {/* 재계산 설명 */}
          <div style={{
            marginTop: 12,
            fontSize: isMobile ? '13px' : '12px',
            color: '#94a3b8',
            lineHeight: 1.5,
          }}>
            ※ 저장 시 이미 입력된 모든 완료 거래의 수수료·세금·순수익이 새 요율로 자동 재계산됩니다.
          </div>
        </div>

        {/* ── 섹션 2: 드롭다운 항목 관리 ── */}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>
          🏷️ 드롭다운 항목 관리
        </div>
        <div style={cardStyle}>
          {/* 카테고리 탭 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => { setActiveTab(cat.key); setNewLabel(''); setOptMsg(null); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: isMobile ? '14px' : '13px',
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
            <div style={{ fontSize: isMobile ? '14px' : '13px', color: '#64748b', marginBottom: 8 }}>
              📋 {currentCatLabel} 항목 ({(options[activeTab] || []).length}개)
            </div>
            {(options[activeTab] || []).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: isMobile ? '14px' : '13px', padding: '8px 0' }}>
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
                    <span style={{ fontSize: isMobile ? '15px' : '14px', color: '#1e293b' }}>{opt.label}</span>
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
            <div style={{ marginTop: 8, fontSize: isMobile ? '14px' : '13px', color: optMsg.type === 'ok' ? '#16a34a' : '#dc2626' }}>
              {optMsg.text}
            </div>
          )}
        </div>

      </div>

      {/* 스피너 애니메이션 */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}