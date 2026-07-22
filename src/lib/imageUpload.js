import { supabase } from './supabase'

/* ─────────────────────────────────────────
   차트 이미지 업로드 공통 유틸
   (NewTrade.jsx / EditTrade.jsx / TradeDetail.jsx 공용)

   ⚠️ 규칙: trades.chart_images 컬럼에는 항상 "스토리지 경로"
   (예: charts/1234_ab.png)만 저장한다. 완성된 접속 URL을
   저장하면 안 됨 — 화면 표시 시 getChartImageUrl(s)로 매번
   새로 URL을 계산하는 구조이기 때문 (2026-07-22 버그 수정,
   PATCH 015 참고)
───────────────────────────────────────── */

const BUCKET = 'chart-images'

/**
 * 이미지 파일 배열을 Storage에 업로드하고,
 * 성공한 파일들의 "경로" 배열을 반환한다.
 * 일부 파일 업로드가 실패해도 나머지는 계속 진행한다 (기존 동작 유지).
 */
export async function uploadChartImages(files) {
  const paths = []
  for (const file of files) {
    if (!file) continue
    const ext = (file.name && file.name.split('.').pop()) || 'jpg'
    const path = `charts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file)
    if (!error) paths.push(path)
  }
  return paths
}

/** 경로 배열에 해당하는 이미지를 Storage에서 삭제한다 */
export async function deleteChartImages(paths) {
  if (!paths || paths.length === 0) return
  await supabase.storage.from(BUCKET).remove(paths)
}

/** 경로 하나를 공개 접속 URL로 변환 */
export function getChartImageUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** 경로 배열을 공개 접속 URL 배열로 변환 */
export function getChartImageUrls(paths) {
  if (!paths) return []
  return paths.map(getChartImageUrl)
}

/**
 * 클립보드 붙여넣기로 얻은 File들에 파일명(확장자 포함)을 부여한다.
 * 클립보드에서 바로 얻은 File은 이름이 비어있거나 확장자가 없는 경우가
 * 있어, 업로드 전에 항상 이 함수로 이름을 보정해서 사용한다.
 */
export function nameClipboardFiles(files) {
  return files.map((file, i) => {
    const ext = file.type.split('/')[1] || 'png'
    return new File([file], `paste_${Date.now()}_${i}.${ext}`, { type: file.type })
  })
}