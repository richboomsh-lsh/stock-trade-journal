# -*- coding: utf-8 -*-
"""
backfill_export_data.py
관세청 무역통계 API → Supabase export_monthly 테이블에 "과거 12개월치"를 한 번에 채워 넣는
1회성 백필(backfill) 스크립트. (EXPORT-PATCH 005의 전제조건 작업 = EXPORT-PATCH 006)

collect_monthly_export_data.py는 "이번 달 1개월"만 수집하는 매월 자동화용 스크립트이고,
이 스크립트는 그것과 별개로 딱 한 번만 실행해서 과거 데이터를 채우는 용도입니다.

collect_monthly_export_data.py의 ITEM_MAPPING / HS_CODE_GROUPS / 환경변수 로딩 /
합계행 제외·페이지네이션 방어 로직을 그대로 재사용하며, API 호출 "방식"만 다릅니다:

  - collect_monthly_export_data.py : 헤딩(또는 코드)당 "1개월"씩 호출
                                      → 24번 반복하면 호출 수가 24배로 폭증
                                      (예: 일반기계 헤딩 114개 × 24개월 = 2,736회)
                                      관세청 API는 보통 하루 호출 한도가 있어 위험함
  - 이 스크립트                     : 헤딩(또는 코드)당 "12개월 범위"로 2번씩 조회
                                      → 관세청 API가 "조회기간 1년 이내"만 허용하는
                                        제약이 있어(실제 테스트로 확인됨), 24개월을
                                        12개월씩 2구간으로 쪼개서 호출 후 결과를 합침
                                      → 호출 수는 (헤딩/코드 개수 x 2)회 수준

백필 대상 (DB에 실제로 저장되는 기간): 2025년 6월(202506) ~ 2026년 5월(202605), 12개월
실제 API 조회 기간(범위)              : 2024년 6월(202406) ~ 2026년 5월(202605), 24개월
  → 2025년 6월의 전년동월대비(YoY)를 계산하려면 2024년 6월 데이터가 필요하기 때문에
    12개월을 더 앞당겨서 조회함 (조회만 하고 이 12개월치는 DB에 저장하지 않음)

대상 품목: ITEM_MAPPING에서 status가 confirmed/deferred인 16개 품목만
          (unverified 4개 - 섬유/생활용품/농수산식품/가전 - 는 이번에도 제외, 자동 스킵됨)

사용법 (PowerShell):
    cd C:\\Users\\romio\\Documents\\stock-trade-journal
    python backfill_export_data.py             # 실제로 Supabase에 저장
    python backfill_export_data.py --dry-run   # 저장 없이 계산 결과만 미리보기 (먼저 이걸로 확인 권장)

필요 파일 (같은 폴더에 있어야 함):
    collect_monthly_export_data.py
    hs_code_groups.json

필요 환경변수: collect_monthly_export_data.py와 동일 (.env.local)
    CUSTOMS_API_SERVICE_KEY / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY

⚠️ 실행 전 확인사항:
    - data.go.kr 마이페이지에서 이 API의 "일일 호출 한도"를 먼저 확인해 주세요.
      이 스크립트는 총 호출 횟수를 화면에 미리 출력해주니, 그 숫자가 한도보다
      작은지 확인 후 실제 실행(--dry-run 없이)하는 것을 권장합니다.
    - 이미 저장되어 있는 2026년 5월(202605) 데이터도 이번 백필로 덮어써집니다.
      (yoy_rate는 기존과 동일하게 나오고, mom_rate만 새로 채워지는 정도라 안전합니다)
"""

import sys
import time
import xml.etree.ElementTree as ET

import requests

from collect_monthly_export_data import (
    CUSTOMS_SERVICE_KEY,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    CUSTOMS_BASE_URL,
    NUM_OF_ROWS,
    ITEM_MAPPING,
    HS_CODE_GROUPS,
    REQUEST_DELAY_SEC,
    prev_year_yymm,
    calc_yoy_rate,
)

# ============================================================
# 0. 백필 기간 설정
# ============================================================

TARGET_START = "202506"   # 백필 대상(=DB 저장 대상) 첫 달
TARGET_END = "202605"     # 백필 대상 마지막 달 (현재 자동수집 최신월과 동일)
FETCH_START = "202406"    # 실제 API 조회 시작월 (TARGET_START의 전년동월까지 포함하도록 12개월 앞당김)
FETCH_END = TARGET_END

# 범위 조회는 한 번에 여러 달치가 올 수 있어 페이지 여유를 넉넉히 둠
# (챕터 단위 헤딩인 "30"(바이오헬스), "72"(철강)는 품목 수가 많아 특히 여유가 필요함)
MAX_PAGES_RANGE = 300  # 300 x 100건 = 최대 30,000행까지 대응

# ⚠️ 관세청 API 제약: "시작과 종료의 조회기간은 1년이내 기간만 가능합니다" 라는
# 오류가 확인됨. 즉, strtYymm~endYymm 범위는 최대 12개월까지만 허용된다.
# 이 스크립트는 24개월치(FETCH_START~FETCH_END)가 필요하므로, 12개월 단위로
# 쪼개서(chunk) 여러 번 호출한 뒤 결과를 합치는 방식으로 처리한다.
MAX_RANGE_MONTHS = 12


# ============================================================
# 1. 월(yymm) 계산 유틸
# ============================================================

def _yymm_to_tuple(yymm: str) -> tuple:
    return int(yymm[:4]), int(yymm[4:6])


def add_months(yymm: str, delta: int) -> str:
    """yymm에 delta개월을 더한다 (delta는 음수 가능). 예: '202506' + (-1) -> '202504'"""
    year, month = _yymm_to_tuple(yymm)
    total = year * 12 + (month - 1) + delta
    new_year, new_month = divmod(total, 12)
    return f"{new_year}{new_month + 1:02d}"


def month_range(start_yymm: str, end_yymm: str) -> list:
    """start~end 사이의 모든 yymm 목록 (양끝 포함, 오름차순)"""
    result = []
    cur = start_yymm
    while True:
        result.append(cur)
        if cur == end_yymm:
            break
        cur = add_months(cur, 1)
    return result


def chunk_range(start_yymm: str, end_yymm: str, max_span_months: int = MAX_RANGE_MONTHS) -> list:
    """
    start~end 구간을 max_span_months(기본 12개월) 이하 단위로 쪼갠다.
    관세청 API의 "조회기간 1년 이내" 제약 때문에 필요.
    반환값 예: [("202406","202505"), ("202506","202605")]
    """
    chunks = []
    cur_start = start_yymm
    while int(cur_start) <= int(end_yymm):
        cur_end = add_months(cur_start, max_span_months - 1)
        if int(cur_end) > int(end_yymm):
            cur_end = end_yymm
        chunks.append((cur_start, cur_end))
        cur_start = add_months(cur_end, 1)
    return chunks


def calc_mom_rate(curr_amount: float, prev_amount):
    """전월대비(%) 계산. calc_yoy_rate와 계산식은 동일 (비교 기준월만 다름)."""
    if prev_amount is None or prev_amount == 0:
        return None
    return round((curr_amount - prev_amount) / prev_amount * 100, 1)


# ============================================================
# 2. 관세청 API 범위 조회 (24개월치를 한 번에) + 합계행 제외
# ============================================================

def _request_with_retry(url: str, max_retries: int = 4, base_delay: float = 2.0):
    """
    requests.get()을 감싸서 네트워크 오류(ConnectionError, Timeout) 발생 시
    잠시 대기 후 자동 재시도한다 (data.go.kr 서버가 연속 호출 중 연결을
    강제로 끊는 경우가 있어 추가됨 — WinError 10054 등).
    """
    last_exc = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            return resp
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            last_exc = e
            wait = base_delay * attempt
            print(f"    ⚠️  네트워크 오류, {wait:.0f}초 후 재시도 ({attempt}/{max_retries}회): {type(e).__name__}")
            time.sleep(wait)
    raise last_exc


def fetch_item_trade_range_raw(strt_yymm: str, end_yymm: str, hs_code: str) -> list:
    """
    단일 HS코드(또는 헤딩)에 대해 strt_yymm~end_yymm 범위를 한 번에 조회하고,
    합계행(hsCode 또는 statKor == '-')을 제외한 개별 행을 그대로 반환한다.
    각 행: {"yymm": "202605", "hsCode": "...", "statKor": "...", "expDlr": float}

    collect_monthly_export_data.py의 fetch_item_trade_raw()와 동일한
    합계행 제외 + 페이지 반복 응답 방어 로직을 그대로 사용하되,
    응답의 `year` 필드("2026.05")를 읽어 yymm으로 변환하는 부분만 추가되었다.
    """
    all_rows = []
    seen_signatures = set()
    hit_page_limit = True

    for page_no in range(1, MAX_PAGES_RANGE + 1):
        url = (
            f"{CUSTOMS_BASE_URL}"
            f"?serviceKey={CUSTOMS_SERVICE_KEY}"
            f"&strtYymm={strt_yymm}&endYymm={end_yymm}"
            f"&hsSgn={hs_code}"
            f"&numOfRows={NUM_OF_ROWS}&pageNo={page_no}"
        )

        resp = _request_with_retry(url)

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            print(f"    ⚠️  XML 파싱 실패 (hs={hs_code}, page={page_no}) — 응답 일부: {resp.text[:200]}")
            hit_page_limit = False
            break

        result_code = root.findtext(".//resultCode")
        if result_code is not None and result_code != "00":
            result_msg = root.findtext(".//resultMsg")
            print(f"    ⚠️  API 오류 응답 (hs={hs_code}): {result_code} {result_msg}")
            hit_page_limit = False
            break

        items = root.findall(".//item")
        if not items:
            hit_page_limit = False
            break

        page_rows = []
        for item in items:
            hs_code_val = (item.findtext("hsCode") or "").strip()
            stat_kor_val = (item.findtext("statKor") or "").strip()

            # ⚠️ 핵심 버그 방어: 합계행 제외 (기존 로직과 동일)
            if hs_code_val in ("-", "") or stat_kor_val in ("-", ""):
                continue

            year_val = (item.findtext("year") or "").strip()  # 예: "2026.05"
            row_yymm = year_val.replace(".", "")
            if len(row_yymm) != 6 or not row_yymm.isdigit():
                continue  # 형식이 이상한 행은 방어적으로 건너뜀

            exp_dlr_raw = item.findtext("expDlr") or "0"
            try:
                exp_dlr = float(exp_dlr_raw.replace(",", ""))
            except ValueError:
                exp_dlr = 0.0

            page_rows.append({
                "yymm": row_yymm,
                "hsCode": hs_code_val,
                "statKor": stat_kor_val,
                "expDlr": exp_dlr,
            })

        # 페이지 반복 응답 감지 (기존 로직과 동일)
        signature = tuple((r["yymm"], r["hsCode"], r["statKor"], r["expDlr"]) for r in page_rows)
        if signature in seen_signatures:
            print(f"    ⚠️  페이지 반복 응답 감지 (hs={hs_code}, page={page_no}) — 루프 중단")
            hit_page_limit = False
            break
        seen_signatures.add(signature)

        all_rows.extend(page_rows)

        if len(items) < NUM_OF_ROWS:
            hit_page_limit = False
            break

        time.sleep(REQUEST_DELAY_SEC)
    else:
        hit_page_limit = True

    if hit_page_limit:
        print(f"    ⚠️  MAX_PAGES_RANGE({MAX_PAGES_RANGE})에 도달했습니다 (hs={hs_code}) "
              f"— 데이터가 누락됐을 수 있으니 MAX_PAGES_RANGE를 늘려서 재실행을 고려하세요.")

    return all_rows


def fetch_item_trade_multi_range_raw(overall_start: str, overall_end: str, hs_code: str) -> list:
    """
    overall_start~overall_end 구간이 12개월을 넘으면 자동으로 12개월 단위로
    쪼개서 여러 번 호출한 뒤 결과를 합쳐서 반환한다 (API의 1년 제약 대응).
    """
    all_rows = []
    for chunk_start, chunk_end in chunk_range(overall_start, overall_end):
        rows = fetch_item_trade_range_raw(chunk_start, chunk_end, hs_code)
        all_rows.extend(rows)
        time.sleep(REQUEST_DELAY_SEC)
    return all_rows


def sum_rows_by_month(rows: list) -> dict:
    """rows 전체의 expDlr을 yymm별로 합산 (mode=heading용 — 필터링 없이 전부 합산)"""
    totals = {}
    for r in rows:
        totals[r["yymm"]] = totals.get(r["yymm"], 0.0) + r["expDlr"]
    return totals


def sum_rows_by_month_filtered(rows: list, target_codes_set: set) -> dict:
    """rows 중 hsCode가 target_codes_set에 있는 것만 yymm별로 합산 (mode=hs_list용)"""
    totals = {}
    for r in rows:
        if r["hsCode"] in target_codes_set:
            totals[r["yymm"]] = totals.get(r["yymm"], 0.0) + r["expDlr"]
    return totals


def merge_monthly_totals(dicts: list) -> dict:
    merged = {}
    for d in dicts:
        for yymm, amount in d.items():
            merged[yymm] = merged.get(yymm, 0.0) + amount
    return merged


# ============================================================
# 3. 품목별 24개월 데이터 수집 (mode 분기)
# ============================================================

def get_item_monthly_amounts(item_name: str, meta: dict):
    """
    품목 하나에 대해 FETCH_START~FETCH_END 범위의 월별 수출액 딕셔너리를 반환.
    반환값이 None이면 스킵 대상 (미검증 등).
    두 번째 반환값은 이번 조회에 사용한 API 호출 횟수(통계용).
    """
    mode = meta["mode"]

    n_chunks = len(chunk_range(FETCH_START, FETCH_END))  # 보통 2 (12개월씩 2구간)

    if mode == "heading":
        hs_codes = meta["hs_codes"]
        if not hs_codes:
            return None, 0, None
        results = []
        for hs_code in hs_codes:
            rows = fetch_item_trade_multi_range_raw(FETCH_START, FETCH_END, hs_code)
            results.append(sum_rows_by_month(rows))
        return merge_monthly_totals(results), len(hs_codes) * n_chunks, hs_codes

    elif mode == "hs_list":
        group_name = meta["group"]
        target_codes = HS_CODE_GROUPS.get(group_name)
        if not target_codes:
            return None, 0, None
        target_set = set(target_codes)
        headings = sorted(set(code[:4] for code in target_set))
        results = []
        for heading in headings:
            rows = fetch_item_trade_multi_range_raw(FETCH_START, FETCH_END, heading)
            results.append(sum_rows_by_month_filtered(rows, target_set))
        return merge_monthly_totals(results), len(headings) * n_chunks, target_codes

    return None, 0, None


# ============================================================
# 4. Supabase upsert (mom_rate 포함 — 기존 함수를 확장한 로컬 버전)
# ============================================================

def upsert_export_monthly_with_mom(item_name: str, hs_codes: list, yymm: str,
                                    amount_usd: float, yoy_rate, mom_rate, status: str) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/export_monthly?on_conflict=item_name,yymm"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    payload = {
        "item_name": item_name,
        "hs_codes": hs_codes,
        "yymm": yymm,
        "export_amount_usd": round(amount_usd, 2),
        "yoy_rate": yoy_rate,
        "mom_rate": mom_rate,
        "verification_status": status,
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=20)
    if resp.status_code in (200, 201, 204):
        return True

    print(f"    ❌ Supabase 저장 실패 ({item_name}, {yymm}): {resp.status_code} {resp.text[:300]}")
    return False


# ============================================================
# 5. 메인 실행 흐름
# ============================================================

def parse_args():
    """
    --dry-run          : 저장 없이 미리보기
    --items 품목1,품목2 : ITEM_MAPPING 중 지정한 품목만 처리 (콤마로 구분, 공백 없이)
                          예: --items 석유화학
                          예: --items 석유화학,비철금속
                          지정 안 하면 16개 전체 처리
    """
    dry_run = "--dry-run" in sys.argv
    items_filter = None
    for i, arg in enumerate(sys.argv):
        if arg == "--items" and i + 1 < len(sys.argv):
            items_filter = set(x.strip() for x in sys.argv[i + 1].split(",") if x.strip())
    return dry_run, items_filter


def main():
    dry_run, items_filter = parse_args()

    if not dry_run and (not CUSTOMS_SERVICE_KEY or not SUPABASE_URL or not SUPABASE_ANON_KEY):
        print("❌ 환경변수가 설정되지 않았습니다. .env.local 파일에 다음 값을 확인하세요:")
        print("   CUSTOMS_API_SERVICE_KEY / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY")
        sys.exit(1)

    target_months = month_range(TARGET_START, TARGET_END)

    print("=" * 60)
    print(f"수출입동향 백필 스크립트 {'(--dry-run: 저장 없이 미리보기)' if dry_run else ''}")
    print(f"백필 대상(DB 저장): {TARGET_START} ~ {TARGET_END} ({len(target_months)}개월)")
    print(f"API 조회 범위      : {FETCH_START} ~ {FETCH_END}")
    print("=" * 60)

    # 대상 품목 목록 미리 뽑기 (unverified/미매핑 제외, --items 필터 반영)
    n_chunks = len(chunk_range(FETCH_START, FETCH_END))  # 1년 제약으로 보통 2구간
    active_items = []
    total_calls_estimate = 0
    for item_name, meta in ITEM_MAPPING.items():
        if items_filter and item_name not in items_filter:
            continue
        if meta["mode"] == "heading" and meta["hs_codes"]:
            active_items.append(item_name)
            total_calls_estimate += len(meta["hs_codes"]) * n_chunks
        elif meta["mode"] == "hs_list":
            target_codes = HS_CODE_GROUPS.get(meta["group"])
            if target_codes:
                active_items.append(item_name)
                total_calls_estimate += len(set(c[:4] for c in target_codes)) * n_chunks

    if items_filter:
        print(f"--items 필터 적용: {', '.join(sorted(items_filter))}")

    print(f"대상 품목: {len(active_items)}개 — {', '.join(active_items)}")
    print(f"예상 API 호출 횟수: 약 {total_calls_estimate}회 "
          f"(data.go.kr 일일 호출 한도를 미리 확인해 주세요)")
    print("=" * 60)
    print()

    success_count = 0
    fail_count = 0
    skipped = []

    for item_name, meta in ITEM_MAPPING.items():
        if items_filter and item_name not in items_filter:
            continue
        status = meta["status"]

        monthly_amounts, call_count, saved_hs_codes = get_item_monthly_amounts(item_name, meta)
        if monthly_amounts is None:
            print(f"⏭️  {item_name} — 미검증/미매핑, 스킵")
            skipped.append(item_name)
            continue

        print(f"▶ {item_name} (API 호출 {call_count}회)")

        for target_yymm in target_months:
            curr = monthly_amounts.get(target_yymm, 0.0)
            prev_year_amount = monthly_amounts.get(prev_year_yymm(target_yymm))
            prev_month_amount = monthly_amounts.get(add_months(target_yymm, -1))

            yoy = calc_yoy_rate(curr, prev_year_amount) if prev_year_amount is not None else None
            mom = calc_mom_rate(curr, prev_month_amount)

            note = "" if curr > 0 else "  ⚠️ 수출액 0 (데이터 없음 가능성)"
            print(f"    {target_yymm}: ${curr:,.0f} | YoY {yoy}% | MoM {mom}%{note}")

            if dry_run:
                continue

            ok = upsert_export_monthly_with_mom(
                item_name, saved_hs_codes, target_yymm, curr, yoy, mom, status
            )
            if ok:
                success_count += 1
            else:
                fail_count += 1

        print()

    print("=" * 60)
    if dry_run:
        print("=== --dry-run 완료 (Supabase에 실제로 저장되지 않았습니다) ===")
        print("결과가 예상과 같으면, --dry-run 없이 다시 실행해서 실제로 저장하세요.")
    else:
        print("=== 백필 완료 ===")
        print(f"저장 성공: {success_count}건 / 실패: {fail_count}건 / 스킵(미검증): {len(skipped)}건")
    if skipped:
        print(f"스킵된 품목: {', '.join(skipped)}")


if __name__ == "__main__":
    main()