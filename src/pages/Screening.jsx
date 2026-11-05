import { useEffect, useState } from 'react'
import { supabaseScreening } from '../lib/supabaseScreening'

// 탭마다 따로 날짜 목록 / 선택 날짜 / 결과 / 종목명을 관리하는 조회 로직
function useScreeningData(table) {
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [results, setResults] = useState([])
  const [stockNames, setStockNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchDates() {
      const { data, error } = await supabaseScreening
        .from(table)
        .select('trade_date')
        .order('trade_date', { ascending: false })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const uniqueDates = [...new Set(data.map((row) => row.trade_date))]
      setDates(uniqueDates)
      if (uniqueDates.length > 0) {
        setSelectedDate(uniqueDates[0])
      } else {
        setLoading(false)
      }
    }
    fetchDates()
  }, [table])

  useEffect(() => {
    if (!selectedDate) return

    async function fetchResults() {
      setLoading(true)
      const { data, error } = await supabaseScreening
        .from(table)
        .select('*')
        .eq('trade_date', selectedDate)
        .order('rank_in_result', { ascending: true })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setResults(data)

      const stockCodes = [...new Set(data.map((row) => row.stock_code))]
      if (stockCodes.length > 0) {
        const { data: stockData, error: stockError } = await supabaseScreening
          .from('stock_master')
          .select('stock_code, stock_name')
          .in('stock_code', stockCodes)

        if (!stockError && stockData) {
          const nameMap = {}
          stockData.forEach((s) => {
            nameMap[s.stock_code] = s.stock_name
          })
          setStockNames(nameMap)
        } else {
          setStockNames({})
        }
      } else {
        setStockNames({})
      }

      setLoading(false)
    }
    fetchResults()
  }, [table, selectedDate])

  return { dates, selectedDate, setSelectedDate, results, stockNames, loading, error }
}

// DB 값이 문자열로 올 수 있어 Number()로 바꾸고, 비었거나 숫자가 아니면 null
function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// 점수: 값 × 100, 소수 1자리 (0.9546 → 95.5)
function formatScore(v) {
  const n = toNum(v)
  return n === null ? '-' : (n * 100).toFixed(1)
}

// 부호 포함 소수 1자리 + % (+12.5%, -1.0%, 0.0%)
function formatSignedPct(v) {
  const n = toNum(v)
  if (n === null) return '-'
  const fixed = n.toFixed(1)
  if (Number(fixed) === 0) return '0.0%'
  return `${Number(fixed) > 0 ? '+' : ''}${fixed}%`
}

function formatPct(v) {
  const n = toNum(v)
  return n === null ? '-' : `${n.toFixed(1)}%`
}

// 원 → 억 원, 소수 1자리 (6290000000 → 62.9억)
function formatEok(v) {
  const n = toNum(v)
  return n === null ? '-' : `${(n / 100000000).toFixed(1)}억`
}

function formatStrongDays(v) {
  const n = toNum(v)
  return n === null ? '-' : `${n}/5일`
}

// 한국 방식: 양수 빨강, 음수 파랑, 0과 null은 기본색
function returnColor(v) {
  const n = toNum(v)
  if (n === null) return undefined
  const rounded = Number(n.toFixed(1))
  if (rounded > 0) return 'red'
  if (rounded < 0) return 'blue'
  return undefined
}

function DateSelect({ dates, selectedDate, onChange }) {
  return (
    <select
      value={selectedDate || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ marginBottom: 16, padding: 8 }}
    >
      {dates.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  )
}

function ConsecutiveTab() {
  const { dates, selectedDate, setSelectedDate, results, stockNames, loading, error } =
    useScreeningData('screening_results')

  if (loading) return <div style={{ padding: 24 }}>불러오는 중...</div>
  if (error) return <div style={{ padding: 24, color: 'red' }}>에러: {error}</div>

  return (
    <div>
      <DateSelect dates={dates} selectedDate={selectedDate} onChange={setSelectedDate} />

      {results.length === 0 ? (
        <p>해당 날짜에 통과한 종목이 없습니다.</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>순위</th>
                <th style={cellStyle}>종목코드</th>
                <th style={cellStyle}>종목명</th>
                <th style={cellStyle}>외국인 연속일</th>
                <th style={cellStyle}>기관 연속일</th>
                <th style={cellStyle}>거래량 점수</th>
                <th style={cellStyle}>거래대금 점수</th>
                <th style={cellStyle}>등락률 점수</th>
                <th style={cellStyle}>종합점수</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.id}>
                  <td style={cellStyle}>{row.rank_in_result}</td>
                  <td style={cellStyle}>{row.stock_code}</td>
                  <td style={cellStyle}>{stockNames[row.stock_code] || '-'}</td>
                  <td style={cellStyle}>{row.foreign_streak_days}</td>
                  <td style={cellStyle}>{row.inst_streak_days}</td>
                  <td style={cellStyle}>{formatScore(row.volume_surge_pct)}</td>
                  <td style={cellStyle}>{formatScore(row.trading_value_pct)}</td>
                  <td style={cellStyle}>{formatScore(row.change_rate_pct)}</td>
                  <td style={cellStyle}>{formatScore(row.final_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={noteStyle}>점수는 그날 후보들 사이의 상대 순위(0~100)입니다</p>
        </>
      )}
    </div>
  )
}

function GradualTab() {
  const { dates, selectedDate, setSelectedDate, results, stockNames, loading, error } =
    useScreeningData('gradual_screening_results')

  if (loading) return <div style={{ padding: 24 }}>불러오는 중...</div>
  if (error) return <div style={{ padding: 24, color: 'red' }}>에러: {error}</div>

  return (
    <div>
      <DateSelect dates={dates} selectedDate={selectedDate} onChange={setSelectedDate} />

      {results.length === 0 ? (
        <p>해당 날짜에 통과한 종목이 없습니다.</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={cellStyle}>순위</th>
                <th style={cellStyle}>종목코드</th>
                <th style={cellStyle}>종목명</th>
                <th style={cellStyle}>20일 수익률</th>
                <th style={cellStyle}>5일 수익률</th>
                <th style={cellStyle}>수급일수</th>
                <th style={cellStyle}>수급강도</th>
                <th style={cellStyle}>5일 순매수</th>
                <th style={cellStyle}>거래대금</th>
                <th style={cellStyle}>등락률</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.id ?? row.stock_code}>
                  <td style={cellStyle}>{row.rank_in_result}</td>
                  <td style={cellStyle}>{row.stock_code}</td>
                  <td style={cellStyle}>{stockNames[row.stock_code] || '-'}</td>
                  <td style={{ ...cellStyle, color: returnColor(row.ret20_pct) }}>
                    {formatSignedPct(row.ret20_pct)}
                  </td>
                  <td style={{ ...cellStyle, color: returnColor(row.ret5_pct) }}>
                    {formatSignedPct(row.ret5_pct)}
                  </td>
                  <td style={cellStyle}>{formatStrongDays(row.strong_days)}</td>
                  <td style={cellStyle}>{formatPct(row.intensity_pct)}</td>
                  <td style={cellStyle}>{formatEok(row.net_buy_5d)}</td>
                  <td style={cellStyle}>{formatEok(row.trading_value)}</td>
                  <td style={{ ...cellStyle, color: returnColor(row.change_rate) }}>
                    {formatSignedPct(row.change_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={noteStyle}>
            수급강도 = 최근 5거래일 (외국인+기관) 순매수 합계 ÷ 거래대금 합계. 당일 급등락 종목이
            섞일 수 있으니 차트를 확인하세요.
          </p>
        </>
      )}
    </div>
  )
}

function Screening() {
  const [tab, setTab] = useState('consecutive')

  return (
    <div style={{ padding: 24 }}>
      <h2>스크리닝 결과</h2>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setTab('consecutive')}
          style={tabStyle(tab === 'consecutive')}
        >
          연속 수급
        </button>
        <button onClick={() => setTab('gradual')} style={tabStyle(tab === 'gradual')}>
          완만한 우상향
        </button>
      </div>

      {tab === 'consecutive' ? <ConsecutiveTab /> : <GradualTab />}
    </div>
  )
}

const cellStyle = { border: '1px solid #ddd', padding: '8px', textAlign: 'left' }
const noteStyle = { fontSize: 12, color: '#666', marginTop: 8 }
const tabStyle = (active) => ({
  padding: '8px 16px',
  marginRight: 8,
  border: '1px solid #ddd',
  borderBottom: active ? '2px solid #333' : '1px solid #ddd',
  background: active ? '#f0f0f0' : '#fff',
  fontWeight: active ? 'bold' : 'normal',
  cursor: 'pointer',
})

export default Screening
