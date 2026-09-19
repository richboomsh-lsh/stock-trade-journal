import { useEffect, useState } from 'react'
import { supabaseScreening } from '../lib/supabaseScreening'

function Screening() {
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchDates() {
      const { data, error } = await supabaseScreening
        .from('screening_results')
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
  }, [])

  useEffect(() => {
    if (!selectedDate) return

    async function fetchResults() {
      setLoading(true)
      const { data, error } = await supabaseScreening
        .from('screening_results')
        .select('*')
        .eq('trade_date', selectedDate)
        .order('rank_in_result', { ascending: true })

      if (error) {
        setError(error.message)
      } else {
        setResults(data)
      }
      setLoading(false)
    }
    fetchResults()
  }, [selectedDate])

  if (loading) return <div style={{ padding: 24 }}>불러오는 중...</div>
  if (error) return <div style={{ padding: 24, color: 'red' }}>에러: {error}</div>

  return (
    <div style={{ padding: 24 }}>
      <h2>스크리닝 결과</h2>

      <select
        value={selectedDate || ''}
        onChange={(e) => setSelectedDate(e.target.value)}
        style={{ marginBottom: 16, padding: 8 }}
      >
        {dates.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {results.length === 0 ? (
        <p>해당 날짜에 통과한 종목이 없습니다.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cellStyle}>순위</th>
              <th style={cellStyle}>종목코드</th>
              <th style={cellStyle}>외국인 연속일</th>
              <th style={cellStyle}>기관 연속일</th>
              <th style={cellStyle}>거래량급증</th>
              <th style={cellStyle}>거래대금비중</th>
              <th style={cellStyle}>등락률</th>
              <th style={cellStyle}>종합점수</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.id}>
                <td style={cellStyle}>{row.rank_in_result}</td>
                <td style={cellStyle}>{row.stock_code}</td>
                <td style={cellStyle}>{row.foreign_streak_days}</td>
                <td style={cellStyle}>{row.inst_streak_days}</td>
                <td style={cellStyle}>{row.volume_surge_pct}</td>
                <td style={cellStyle}>{row.trading_value_pct}</td>
                <td style={cellStyle}>{row.change_rate_pct}</td>
                <td style={cellStyle}>{row.final_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const cellStyle = { border: '1px solid #ddd', padding: '8px', textAlign: 'left' }

export default Screening
