import { useState, useEffect, useRef } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { uploadChartImages, deleteChartImages, getChartImageUrl, nameClipboardFiles } from '../lib/imageUpload'

/* ─────────────────────────────────────────
   상수
───────────────────────────────────────── */
const MAX_LINKS = 6

/* ─────────────────────────────────────────
   유틸 함수 — 훅
───────────────────────────────────────── */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function emptyDraft() {
  return { stock_name: '', sector: '', themes: [], memo: '', links: [''] }
}

function toDraft(item) {
  return {
    stock_name: item.stock_name || '',
    sector: item.sector || '',
    themes: item.themes || [],
    memo: item.memo || '',
    links: (item.links && item.links.length > 0) ? item.links : [''],
  }
}

/* ─────────────────────────────────────────
   유틸 함수 — 메모 저장 형식(텍스트+이미지 경로) 변환
   저장 형식: 일반 텍스트 줄 + 이미지가 있던 줄만 "![](경로)" 형태
───────────────────────────────────────── */
function extractImagePaths(memo) {
  if (!memo) return []
  const matches = memo.match(/!\[\]\(([^)]*)\)/g) || []
  return matches.map(m => m.slice(4, -1))
}

function memoPreview(memo) {
  if (!memo) return ''
  const stripped = memo.replace(/!\[\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  return stripped.length > 70 ? stripped.slice(0, 70) + '…' : stripped
}

/* 이미지 한 장을 표시하는 DOM 블록 생성
   — contentEditable=false로 만들어 "하나의 덩어리"로 취급되게 함
     (커서가 블록 안으로 들어가지 않고, 바로 옆에서 Backspace/Delete 시 통째로 삭제됨)
   — 우측 상단 ✕ 버튼으로도 삭제 가능 */
function createImageBlock(path) {
  const wrapper = document.createElement('div')
  wrapper.contentEditable = 'false'
  wrapper.dataset.imgWrapper = 'true'
  wrapper.style.position = 'relative'
  wrapper.style.display = 'inline-block'
  wrapper.style.margin = '8px 0'
  wrapper.style.maxWidth = '100%'

  const img = document.createElement('img')
  img.src = getChartImageUrl(path)
  img.setAttribute('data-path', path)
  img.draggable = false
  img.style.maxWidth = '100%'
  img.style.borderRadius = '8px'
  img.style.display = 'block'

  const delBtn = document.createElement('button')
  delBtn.type = 'button'
  delBtn.textContent = '✕'
  delBtn.setAttribute('aria-label', '이미지 삭제')
  Object.assign(delBtn.style, {
    position: 'absolute', top: '4px', right: '4px',
    background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none',
    borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer',
    fontSize: '12px', lineHeight: '1', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '0',
  })
  delBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const container = wrapper.parentElement
    // wrapper를 감싸고 있던 줄(container div)까지 함께 제거해 빈 줄이 남지 않게 함
    if (container && container.childNodes.length === 1) {
      container.remove()
    } else {
      wrapper.remove()
    }
  })

  wrapper.appendChild(img)
  wrapper.appendChild(delBtn)
  return wrapper
}

/* 저장된 텍스트(마크다운 경로 포함) → contentEditable 초기 DOM으로 변환 (편집 시작 시 1회) */
function hydrateMemoEditor(el, memo) {
  el.innerHTML = ''
  if (!memo) return
  const lines = memo.split('\n')
  lines.forEach(line => {
    const imgMatch = line.match(/^!\[\]\(([^)]*)\)$/)
    const lineDiv = document.createElement('div')
    if (imgMatch) {
      lineDiv.appendChild(createImageBlock(imgMatch[1]))
    } else if (line === '') {
      lineDiv.appendChild(document.createElement('br'))
    } else {
      lineDiv.textContent = line
    }
    el.appendChild(lineDiv)
  })
}

/* contentEditable의 현재 DOM → 저장용 텍스트(마크다운 경로 포함)로 직렬화 (저장 시점에 호출) */
function domToMemoText(root) {
  if (!root) return ''
  let result = ''
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (node.dataset && node.dataset.imgWrapper === 'true') {
      const img = node.querySelector('img')
      const path = img ? img.getAttribute('data-path') : ''
      result += `\n![](${path})\n`
      return
    }
    const tag = node.tagName
    if (tag === 'BR') {
      result += '\n'
      return
    }
    const before = result.length
    Array.from(node.childNodes).forEach(walk)
    if (result.length === before || !result.endsWith('\n')) {
      result += '\n'
    }
  }
  Array.from(root.childNodes).forEach(walk)
  return result.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

/* 커서 위치에 이미지 삽입 (paste 시 호출, 순수 DOM 조작) */
function insertImageAtCursor(el, path) {
  if (!el) return
  el.focus()
  const container = document.createElement('div')
  container.appendChild(createImageBlock(path))

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
    el.appendChild(container)
  } else {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(container)
    range.setStartAfter(container)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
}

/* 커서 위치에 일반 텍스트 삽입 (paste 시 호출) */
function insertTextAtCursor(el, text) {
  if (!el) return
  el.focus()
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
    el.appendChild(document.createTextNode(text))
    return
  }
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/* ─────────────────────────────────────────
   하위 컴포넌트 (모듈 최상단 정의 — 8-23 원칙)
───────────────────────────────────────── */
function Label({ children, isMobile }) {
  return (
    <div style={{
      fontWeight: 600, color: '#64748b', marginBottom: '6px',
      fontSize: isMobile ? '14px' : '12px', letterSpacing: '0.3px',
    }}>{children}</div>
  )
}

function MultiSelect({ options, selected, onChange, color, isMobile }) {
  if (!options || options.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map(opt => {
        const on = selected.includes(opt)
        return (
          <button key={opt} type="button"
            onClick={() => on ? onChange(selected.filter(s => s !== opt)) : onChange([...selected, opt])}
            style={{
              padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
              border: `1.5px solid ${on ? color : '#d1d5db'}`,
              background: on ? color : '#fff',
              color: on ? '#fff' : '#374151',
              fontSize: isMobile ? '16px' : '14px',
              fontWeight: on ? 600 : 400,
            }}
          >{opt}</button>
        )
      })}
    </div>
  )
}

/* 메모 에디터 — contentEditable 기반, 텍스트+이미지가 한 칸 안에 바로 보임 */
function MemoEditor({ memoRef, initialMemo, isMobile }) {
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'div')
    const el = memoRef.current
    if (el) hydrateMemoEditor(el, initialMemo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={memoRef}
      contentEditable
      suppressContentEditableWarning
      data-placeholder="이 종목을 왜 관심있게 보는지, 진입 아이디어 등을 자유롭게 적어보세요. 이미지도 Ctrl+V로 바로 붙여넣을 수 있습니다."
      className="wl-memo-editor"
      style={{
        minHeight: '300px', border: '1.5px solid #d1d5db', borderRadius: '6px',
        padding: '12px', fontSize: isMobile ? '16px' : '14px', lineHeight: 1.6,
        background: '#fff', color: '#1e293b', outline: 'none', wordBreak: 'break-word',
        boxSizing: 'border-box', transition: 'border-color 0.15s', textAlign: 'left',
      }}
    />
  )
}

function WatchlistCard({
  item, isNew, expanded, isMobile, draft, setDraft, opts,
  inputStyle, onToggle, onCancel, onSave, onDelete,
  saving, error, onAddLink, onRemoveLink, onUpdateLink,
}) {
  const memoRef = useRef(null)
  const [pasteMsg, setPasteMsg] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)

  /* 붙여넣기 — 이 카드의 메모 칸에 포커스된 상태에서만 처리 */
  async function handlePaste(e) {
    e.preventDefault()
    const items = e.clipboardData?.items
    const imageItems = items ? Array.from(items).filter(it => it.type.startsWith('image/')) : []

    if (imageItems.length > 0) {
      const files = imageItems.map(it => it.getAsFile()).filter(Boolean)
      const namedFiles = nameClipboardFiles(files)
      setUploadingImage(true)
      try {
        const paths = await uploadChartImages(namedFiles)
        paths.forEach(p => insertImageAtCursor(memoRef.current, p))
        setPasteMsg('이미지가 추가되었습니다!')
        setTimeout(() => setPasteMsg(''), 2000)
      } finally {
        setUploadingImage(false)
      }
      return
    }

    const text = e.clipboardData.getData('text/plain')
    if (text) insertTextAtCursor(memoRef.current, text)
  }

  function handleInput(e) {
    const el = e.currentTarget
    const hasImg = !!el.querySelector('img')
    if (!hasImg && el.textContent.trim() === '') el.innerHTML = ''
  }

  const headerStockName = expanded ? draft.stock_name : item?.stock_name
  const headerSector = expanded ? draft.sector : item?.sector
  const headerThemes = expanded ? draft.themes : (item?.themes || [])
  const headerLinksCount = expanded
    ? draft.links.filter(l => l.trim()).length
    : (item?.links || []).length
  const headerImagesCount = expanded ? null : extractImagePaths(item?.memo).length
  const headerUpdatedAt = item?.updated_at

  return (
    <div style={{
      background: '#fff', border: `1px solid ${expanded ? '#93c5fd' : '#e2e8f0'}`,
      borderRadius: '10px', transition: 'border-color 0.15s',
    }}>
      {/* 헤더 — 클릭으로 펼침/접힘 */}
      <div
        onClick={isNew ? undefined : onToggle}
        style={{
          padding: isMobile ? '14px' : '16px 18px',
          cursor: isNew ? 'default' : 'pointer',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>
            {isNew ? (headerStockName || '새 종목') : headerStockName}
          </span>
          {headerSector && (
            <span style={{
              padding: '1px 7px', background: '#f1f5f9', color: '#64748b',
              borderRadius: '4px', fontSize: isMobile ? '14px' : '13px', whiteSpace: 'nowrap',
            }}>{headerSector}</span>
          )}
          {headerThemes.map(t => (
            <span key={t} style={{
              padding: '1px 7px', background: '#f5f3ff', color: '#7c3aed',
              borderRadius: '4px', fontSize: isMobile ? '14px' : '13px', whiteSpace: 'nowrap',
            }}>{t}</span>
          ))}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, fontSize: isMobile ? '13px' : '12px', color: '#94a3b8' }}>
          {headerUpdatedAt && <div>{dayjs(headerUpdatedAt).format('YY.MM.DD')}</div>}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
            {headerLinksCount > 0 && <span>🔗 {headerLinksCount}</span>}
            {headerImagesCount > 0 && <span>📷 {headerImagesCount}</span>}
          </div>
        </div>
      </div>

      {!expanded && item?.memo && (
        <div style={{
          padding: isMobile ? '0 14px 14px' : '0 18px 16px',
          fontSize: isMobile ? '14px' : '13px', color: '#64748b',
        }}>
          {memoPreview(item.memo)}
        </div>
      )}

      {expanded && (
        <div style={{
          padding: isMobile ? '0 14px 14px' : '0 18px 18px',
          borderTop: '1px solid #f1f5f9', marginTop: '-1px',
        }}>
          <div style={{ marginTop: '14px' }}>
            <Label isMobile={isMobile}>종목명</Label>
            <input
              value={draft.stock_name}
              onChange={e => setDraft({ ...draft, stock_name: e.target.value })}
              placeholder="예: 삼성전자"
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: '14px' }}>
            <Label isMobile={isMobile}>섹터</Label>
            <select
              value={draft.sector}
              onChange={e => setDraft({ ...draft, sector: e.target.value })}
              style={inputStyle}
            >
              <option value="">선택</option>
              {opts.sector.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ marginTop: '14px' }}>
            <Label isMobile={isMobile}>테마</Label>
            <MultiSelect
              options={opts.theme}
              selected={draft.themes}
              onChange={themes => setDraft({ ...draft, themes })}
              color="#7c3aed"
              isMobile={isMobile}
            />
          </div>

          <div style={{ marginTop: '14px' }}>
            <Label isMobile={isMobile}>메모</Label>
            <div onPaste={handlePaste} onInput={handleInput}>
              <MemoEditor memoRef={memoRef} initialMemo={draft.memo} isMobile={isMobile} />
            </div>
            {uploadingImage && (
              <div style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>이미지 업로드 중...</div>
            )}
            {pasteMsg && (
              <div style={{ color: '#16a34a', fontSize: '13px', marginTop: '6px', fontWeight: 600 }}>✓ {pasteMsg}</div>
            )}
          </div>

          <div style={{ marginTop: '14px' }}>
            <Label isMobile={isMobile}>링크 (최대 {MAX_LINKS}개)</Label>
            {draft.links.map((link, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="url"
                  value={link}
                  onChange={e => onUpdateLink(i, e.target.value)}
                  placeholder="https://..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                {link.trim() && (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    style={{
                      padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px',
                      background: '#eff6ff', color: '#2563eb', textDecoration: 'none',
                      fontSize: '13px', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
                    }}
                  >열기</a>
                )}
                <button type="button" onClick={() => onRemoveLink(i)}
                  style={{
                    padding: '8px 12px', border: '1px solid #fca5a5', borderRadius: '6px',
                    background: '#fff5f5', color: '#dc2626', cursor: 'pointer',
                  }}>✕</button>
              </div>
            ))}
            {draft.links.length < MAX_LINKS && (
              <button type="button" onClick={onAddLink}
                style={{
                  padding: '7px 16px', border: '1.5px dashed #d1d5db', borderRadius: '6px',
                  background: '#f8fafc', color: '#64748b', cursor: 'pointer',
                  fontSize: isMobile ? '14px' : '13px',
                }}>+ 링크 추가</button>
            )}
          </div>

          {error && (
            <div style={{
              color: '#dc2626', padding: '10px 12px', background: '#fff5f5',
              border: '1px solid #fca5a5', borderRadius: '6px', marginTop: '14px', fontSize: '13px',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            {!isNew && (
              <button type="button" onClick={onDelete}
                style={{
                  padding: '10px 14px', border: '1px solid #fca5a5', borderRadius: '8px',
                  background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontWeight: 600,
                  fontSize: isMobile ? '14px' : '13px',
                }}>삭제</button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onCancel}
              style={{
                padding: '10px 16px', border: '1.5px solid #d1d5db', borderRadius: '8px',
                background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 600,
                fontSize: isMobile ? '14px' : '13px',
              }}>취소</button>
            <button type="button" onClick={() => onSave(domToMemoText(memoRef.current))} disabled={saving}
              style={{
                padding: '10px 18px', border: 'none', borderRadius: '8px',
                background: saving ? '#94a3b8' : '#2563eb', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700,
                fontSize: isMobile ? '14px' : '13px',
              }}>{saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────
   메인 컴포넌트
───────────────────────────────────────── */
export default function WatchlistPage() {
  const isMobile = useIsMobile()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [opts, setOpts] = useState({ sector: [], theme: [] })
  const [expandedId, setExpandedId] = useState(null) // item.id | 'new' | null
  const [draft, setDraft] = useState(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchItems(); fetchOptions() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('watchlist').select('*').order('updated_at', { ascending: false })
    if (!error) setItems(data || [])
    setLoading(false)
  }

  async function fetchOptions() {
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('category, label')
      .in('category', ['sector', 'theme'])
      .order('sort_order', { ascending: true })
    if (!error && data) {
      const grouped = { sector: [], theme: [] }
      data.forEach(d => { if (grouped[d.category]) grouped[d.category].push(d.label) })
      setOpts(grouped)
    }
  }

  function startNew() {
    setExpandedId('new')
    setDraft(emptyDraft())
    setError('')
  }

  function startEdit(item) {
    setExpandedId(item.id)
    setDraft(toDraft(item))
    setError('')
  }

  function collapse() {
    setExpandedId(null)
    setDraft(emptyDraft())
    setError('')
  }

  function toggle(item) {
    if (expandedId === item.id) collapse()
    else startEdit(item)
  }

  function updateLink(i, value) {
    const updated = [...draft.links]
    updated[i] = value
    setDraft({ ...draft, links: updated })
  }

  function addLink() {
    if (draft.links.length >= MAX_LINKS) return
    setDraft({ ...draft, links: [...draft.links, ''] })
  }

  function removeLink(i) {
    setDraft({ ...draft, links: draft.links.filter((_, idx) => idx !== i) })
  }

  async function handleSave(memoText) {
    if (!draft.stock_name.trim()) { setError('종목명을 입력해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      const validLinks = draft.links.map(l => l.trim()).filter(Boolean).slice(0, MAX_LINKS)
      const payload = {
        stock_name: draft.stock_name.trim(),
        sector: draft.sector || null,
        themes: draft.themes.length > 0 ? draft.themes : null,
        memo: memoText || null,
        links: validLinks.length > 0 ? validLinks : null,
      }

      /* 기존 항목 수정인 경우 — 메모에서 빠진(삭제된) 이미지만 Storage에서 정리
         (취소 시에는 절대 실행되지 않고, 저장이 확정된 순간에만 정리하므로 안전함) */
      if (expandedId !== 'new') {
        const original = items.find(i => i.id === expandedId)
        if (original) {
          const oldPaths = extractImagePaths(original.memo)
          const newPaths = extractImagePaths(memoText)
          const removedPaths = oldPaths.filter(p => !newPaths.includes(p))
          if (removedPaths.length > 0) await deleteChartImages(removedPaths)
        }
      }

      if (expandedId === 'new') {
        const { error: insertErr } = await supabase.from('watchlist').insert([payload])
        if (insertErr) throw insertErr
      } else {
        const { error: updateErr } = await supabase.from('watchlist').update(payload).eq('id', expandedId)
        if (updateErr) throw updateErr
      }
      await fetchItems()
      collapse()
    } catch (err) {
      setError(err.message || '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!window.confirm('이 관심종목을 삭제하시겠습니까? (첨부된 이미지도 함께 삭제됩니다)')) return
    const target = items.find(i => i.id === id)
    const imagePaths = target ? extractImagePaths(target.memo) : []
    if (imagePaths.length > 0) await deleteChartImages(imagePaths)
    await supabase.from('watchlist').delete().eq('id', id)
    if (expandedId === id) collapse()
    fetchItems()
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1.5px solid #d1d5db', borderRadius: '6px',
    fontSize: isMobile ? '16px' : '14px', background: '#ffffff',
    boxSizing: 'border-box', transition: 'border-color 0.15s', color: '#1e293b',
  }

  return (
    <div style={{ paddingBottom: isMobile ? '80px' : '0' }}>
      <style>{`
        .wl-memo-editor, .wl-memo-editor * {
          text-align: left !important;
        }
        .wl-memo-editor:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
        }
        .wl-memo-editor:focus {
          border-color: #3b82f6 !important;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
          ⭐ 관심종목
        </h2>
        {expandedId !== 'new' && (
          <button onClick={startNew} style={{
            padding: '8px 16px', border: 'none', borderRadius: '8px',
            background: '#2563eb', color: '#fff', fontWeight: 600,
            fontSize: isMobile ? '14px' : '13px', cursor: 'pointer',
          }}>+ 종목 추가</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>불러오는 중...</div>
      ) : (items.length === 0 && expandedId !== 'new') ? (
        <div style={{
          textAlign: 'center', padding: '48px', background: '#fff',
          borderRadius: '12px', border: '1px solid #e2e8f0', color: '#94a3b8',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>⭐</div>
          <p>등록된 관심종목이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {expandedId === 'new' && (
            <WatchlistCard
              isNew
              expanded
              isMobile={isMobile}
              draft={draft}
              setDraft={setDraft}
              opts={opts}
              inputStyle={inputStyle}
              onCancel={collapse}
              onSave={handleSave}
              saving={saving}
              error={error}
              onAddLink={addLink}
              onRemoveLink={removeLink}
              onUpdateLink={updateLink}
            />
          )}

          {items.map(item => {
            const expanded = expandedId === item.id
            return (
              <WatchlistCard
                key={item.id}
                item={item}
                expanded={expanded}
                isMobile={isMobile}
                draft={expanded ? draft : null}
                setDraft={setDraft}
                opts={opts}
                inputStyle={inputStyle}
                onToggle={() => toggle(item)}
                onCancel={collapse}
                onSave={handleSave}
                onDelete={(e) => handleDelete(item.id, e)}
                saving={saving}
                error={expanded ? error : ''}
                onAddLink={addLink}
                onRemoveLink={removeLink}
                onUpdateLink={updateLink}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}