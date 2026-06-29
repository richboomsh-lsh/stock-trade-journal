# -*- coding: utf-8 -*-
"""
collect_monthly_export_data.py
관세청 무역통계 API(품목별 수출입실적) → Supabase export_monthly 테이블 적재 통합 스크립트

기존 verify_semiconductor_mapping.py / verify_hbm_trend.py / verify_8items_mapping.py /
verify_computer_ssd.py / verify_biohealth_steel.py / verify_cosmetics.py 의
공통 로직(합계행 제외, XML 파싱, HS코드별 호출)을 하나로 통합한 버전.

사용법 (PowerShell):
    cd C:\\Users\\romio\\Documents\\stock-trade-journal
    python collect_monthly_export_data.py 202605

인자를 안 주면 "이번 달" 기준 전월(YYYYMM)을 자동 사용합니다.
(관세청 데이터는 매월 15일경 전월 확정치가 올라오므로, 보통 전월 데이터를 수집)

필요한 환경변수 (.env 파일 또는 OS 환경변수):
    CUSTOMS_API_SERVICE_KEY   - data.go.kr 관세청_품목별 수출입실적(GW) 서비스키
    VITE_SUPABASE_URL          - https://jrlekinxmshzbroiglqa.supabase.co
    VITE_SUPABASE_ANON_KEY     - Supabase Legacy anon key (eyJ...)

⚠️ 서비스키/anon key는 절대 이 파일에 직접 적지 말 것. .env 파일에서만 불러옴.

필요한 파일:
    hs_code_groups.json  - 이 스크립트와 같은 폴더에 있어야 함.
                            2026.5.6 MTI 코드 개편(15대→20대 품목 확대) 이후,
                            KITA "코드연계표"에서 직접 추출한 품목별 "정확한 10자리
                            HS코드 목록"이 들어있음 (전기기기/일반기계/비철금속/석유화학).
                            이 4개 품목은 산업부 자체 분류(MTI)라서 HS 헤딩 단위로는
                            깨끗하게 안 나뉘어서, 헤딩 전체를 가져온 뒤 정확한 코드만
                            필터링하는 방식(hs_list)으로 처리함 (아래 주석 참고).
"""

import os
import sys
import time
import json
from datetime import datetime
import xml.etree.ElementTree as ET

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
    load_dotenv(".env")
except ImportError:
    # python-dotenv 미설치 시 OS 환경변수만 사용 (설치: pip install python-dotenv)
    pass


# ============================================================
# 0. 환경변수 / 설정
# ============================================================

CUSTOMS_SERVICE_KEY = os.environ.get("CUSTOMS_API_SERVICE_KEY", "").strip()
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "").strip()

CUSTOMS_BASE_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"
NUM_OF_ROWS = 100
MAX_PAGES = 20  # 관세청 API가 pageNo 무시하고 같은 페이지 반복 응답하는 버그 방어용 안전장치
REQUEST_DELAY_SEC = 0.3  # API 과호출(rate limit) 방지용 호출 간 대기시간


# ============================================================
# 1. 산업통상부 "20대 주요 수출 품목" ↔ HS코드 매핑표
#
#    2026.5.6 MTI 코드 개편(15대→20대 확대) 이후 기준.
#    두 가지 방식(mode)으로 품목을 관리한다:
#
#    - mode="heading": HS 헤딩(4자리 이하)을 그대로 hsSgn에 넣어 통째로 조회.
#                       해당 헤딩이 통째로 한 품목에만 속할 때만 사용 가능
#                       (기존 12개 검증완료 품목 — 반도체/자동차/화장품 등).
#
#    - mode="hs_list" : 전기기기/일반기계/비철금속/석유화학처럼 MTI 분류가
#                       HS 헤딩을 산업부 자체 기준으로 잘게 쪼개서 재배치한
#                       경우. 이런 품목은 헤딩 단위로 부르면 다른 품목과
#                       중복(예: 8541 헤딩은 반도체이면서 그 안의
#                       8541430000 하나만 전기기기 — 광전지)이 생기므로,
#                       hs_code_groups.json에 저장된 "정확한 10자리 코드
#                       목록"을 기준으로, 코드가 속한 헤딩을 한 번씩만 호출한
#                       뒤 그 안에서 목록에 있는 코드만 골라 합산한다.
#                       (API 호출은 헤딩 단위로 묶어서 절약 — 예: 일반기계
#                       1,151개 코드도 실제 호출은 114번뿐)
#
#    verification_status: confirmed / deferred / unverified
# ============================================================

# hs_code_groups.json: KITA 코드연계표에서 추출한 정확한 10자리 HS코드 목록
# (전기기기 256개 / 일반기계 1,151개 / 비철금속 304개 / 석유화학 301개
#  — 석유화학은 석유제품과 중복되는 2710 헤딩 내 2개 코드 제외 처리됨)
_HS_GROUPS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hs_code_groups.json")

try:
    with open(_HS_GROUPS_PATH, "r", encoding="utf-8") as f:
        HS_CODE_GROUPS = json.load(f)
except FileNotFoundError:
    HS_CODE_GROUPS = {}
    print(f"⚠️  {_HS_GROUPS_PATH} 파일이 없습니다. hs_list 모드 품목(전기기기/일반기계/비철금속/석유화학)은 건너뜁니다.")


ITEM_MAPPING = {
    # --- 검증 완료 (confirmed) — heading 방식 ---
    "반도체":       {"mode": "heading", "hs_codes": ["8541", "8542"], "status": "confirmed"},
    "디스플레이":    {"mode": "heading", "hs_codes": ["8524"], "status": "confirmed"},
    "컴퓨터":       {"mode": "heading", "hs_codes": ["8471", "8523"], "status": "confirmed"},
    "자동차":       {"mode": "heading", "hs_codes": ["8703"], "status": "confirmed"},
    "자동차부품":    {"mode": "heading", "hs_codes": ["8708"], "status": "confirmed"},
    "이차전지":     {"mode": "heading", "hs_codes": ["8507"], "status": "confirmed"},
    "화장품":       {"mode": "heading", "hs_codes": ["3303", "3304", "3305", "3306", "3307"], "status": "confirmed"},
    "석유제품":     {"mode": "heading", "hs_codes": ["2710"], "status": "confirmed"},
    "선박":        {"mode": "heading", "hs_codes": ["8901", "8902", "8903", "8904", "8905", "8906", "8907", "8908"], "status": "confirmed"},
    "바이오헬스":    {"mode": "heading", "hs_codes": ["30", "9018", "9021", "9022"], "status": "confirmed"},
    "철강":        {"mode": "heading", "hs_codes": ["72"], "status": "confirmed"},

    # --- 검증 보류 (deferred) — HS코드 추정은 있으나 공식 재확인 필요 ---
    "무선통신기기":  {"mode": "heading", "hs_codes": ["8517"], "status": "deferred"},

    # --- 검증 완료 (confirmed) — hs_list 방식, KITA 코드연계표 기준 ---
    "전기기기":     {"mode": "hs_list", "group": "전기기기", "status": "confirmed"},
    "일반기계":     {"mode": "hs_list", "group": "일반기계", "status": "confirmed"},
    "비철금속":     {"mode": "hs_list", "group": "비철금속", "status": "confirmed"},
    "석유화학":     {"mode": "hs_list", "group": "석유화학", "status": "confirmed"},

    # --- 미검증 (unverified) — HS코드 매핑 미완료, 자동 스킵 ---
    #     섬유(1,264개)·생활용품(603개)·가전·농수산식품은 코드 수가 많거나
    #     수출 비중이 상대적으로 작아 이번 차수에서는 보류
    "가전":        {"mode": "heading", "hs_codes": [], "status": "unverified"},
    "농수산식품":    {"mode": "heading", "hs_codes": [], "status": "unverified"},
    "섬유":        {"mode": "heading", "hs_codes": [], "status": "unverified"},
    "생활용품":     {"mode": "heading", "hs_codes": [], "status": "unverified"},
}


# ============================================================
# 2. 관세청 API 호출 + XML 파싱 (합계행 제외 핵심 로직)
# ============================================================

def fetch_item_trade_raw(yymm: str, hs_code: str) -> list[dict]:
    """
    단일 HS코드 + 단일 년월에 대해 관세청 API를 호출하고,
    합계행(hsCode 또는 statKor == '-')을 제외한 개별 품목 행만 반환한다.

    페이지네이션 안전장치: 관세청 API가 일부 조건에서 pageNo를 무시하고
    동일한 페이지를 반복 응답하는 버그가 있어, 이전 페이지와 동일한
    내용(시그니처)이 감지되면 즉시 루프를 종료한다.
    """
    all_rows = []
    seen_signatures = set()

    for page_no in range(1, MAX_PAGES + 1):
        url = (
            f"{CUSTOMS_BASE_URL}"
            f"?serviceKey={CUSTOMS_SERVICE_KEY}"
            f"&strtYymm={yymm}&endYymm={yymm}"
            f"&hsSgn={hs_code}"
            f"&numOfRows={NUM_OF_ROWS}&pageNo={page_no}"
        )

        resp = requests.get(url, timeout=20)
        resp.raise_for_status()

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            print(f"  ⚠️  XML 파싱 실패 (yymm={yymm}, hs={hs_code}, page={page_no}) — 응답 일부: {resp.text[:200]}")
            break

        # 결과 코드 체크 (data.go.kr 공통 포맷: resultCode != '00' 이면 오류)
        result_code = root.findtext(".//resultCode")
        if result_code is not None and result_code != "00":
            result_msg = root.findtext(".//resultMsg")
            print(f"  ⚠️  API 오류 응답 (yymm={yymm}, hs={hs_code}): {result_code} {result_msg}")
            break

        items = root.findall(".//item")
        if not items:
            break  # 더 이상 데이터 없음 → 정상 종료

        page_rows = []
        for item in items:
            hs_code_val = (item.findtext("hsCode") or "").strip()
            stat_kor_val = (item.findtext("statKor") or "").strip()

            # ⚠️ 핵심 버그 방어: 합계행(hsCode=='-' or statKor=='-' or 빈값) 제외
            if hs_code_val in ("-", "") or stat_kor_val in ("-", ""):
                continue

            exp_dlr_raw = item.findtext("expDlr") or "0"
            try:
                exp_dlr = float(exp_dlr_raw.replace(",", ""))
            except ValueError:
                exp_dlr = 0.0

            page_rows.append({
                "hsCode": hs_code_val,
                "statKor": stat_kor_val,
                "expDlr": exp_dlr,
            })

        # 페이지 시그니처 — 동일 페이지 반복 응답 감지
        signature = tuple((r["hsCode"], r["statKor"], r["expDlr"]) for r in page_rows)
        if signature in seen_signatures:
            print(f"  ⚠️  페이지 반복 응답 감지 (yymm={yymm}, hs={hs_code}, page={page_no}) — 루프 중단")
            break
        seen_signatures.add(signature)

        all_rows.extend(page_rows)

        if len(items) < NUM_OF_ROWS:
            break  # 마지막 페이지

        time.sleep(REQUEST_DELAY_SEC)

    return all_rows


def sum_export_amount_by_heading(yymm: str, hs_codes: list[str]) -> float:
    """[mode=heading] 여러 HS 헤딩의 expDlr 합계(달러). 합계행은 이미 제외됨."""
    total = 0.0
    for hs_code in hs_codes:
        rows = fetch_item_trade_raw(yymm, hs_code)
        total += sum(r["expDlr"] for r in rows)
        time.sleep(REQUEST_DELAY_SEC)
    return total


def sum_export_amount_by_hs_list(yymm: str, target_codes: list[str]) -> float:
    """
    [mode=hs_list] 정확한 10자리 HS코드 목록의 expDlr 합계(달러).

    API 호출 최적화: target_codes를 4자리 헤딩별로 그룹핑해서 헤딩당
    1번만 호출한 뒤(예: 1,151개 코드도 114번 호출로 끝남), 응답에서
    target_codes에 정확히 포함된 행만 골라 합산한다. 같은 헤딩 안에
    다른 품목으로 분류된 코드가 섞여 있어도(예: 8541 헤딩 = 반도체 +
    전기기기 일부) 정확히 걸러낼 수 있다.
    """
    target_set = set(target_codes)
    headings = sorted(set(code[:4] for code in target_set))

    total = 0.0
    for heading in headings:
        rows = fetch_item_trade_raw(yymm, heading)
        matched = [r for r in rows if r["hsCode"] in target_set]
        total += sum(r["expDlr"] for r in matched)
        time.sleep(REQUEST_DELAY_SEC)
    return total


# ============================================================
# 3. 전년동월대비(YoY) 계산
# ============================================================

def prev_year_yymm(yymm: str) -> str:
    """'202605' -> '202505' (작년 같은 달)"""
    year = int(yymm[:4])
    month = yymm[4:6]
    return f"{year - 1}{month}"


def calc_yoy_rate(curr_amount: float, prev_amount: float) -> float | None:
    if prev_amount == 0:
        return None
    return round((curr_amount - prev_amount) / prev_amount * 100, 1)


# ============================================================
# 4. Supabase upsert (PostgREST REST API 직접 호출)
# ============================================================

def upsert_export_monthly(item_name: str, hs_codes: list[str], yymm: str,
                           amount_usd: float, yoy_rate: float | None, status: str) -> bool:
    """
    export_monthly 테이블에 upsert.
    unique 제약 (item_name, yymm) 기준으로 merge — 기존 행 있으면 업데이트, 없으면 삽입.
    """
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
        "verification_status": status,
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=20)
    if resp.status_code in (200, 201, 204):
        return True

    print(f"  ❌ Supabase 저장 실패 ({item_name}): {resp.status_code} {resp.text[:300]}")
    return False


# ============================================================
# 5. 메인 실행 흐름
# ============================================================

def get_default_yymm() -> str:
    """인자 없을 때: 이번 달의 전월(YYYYMM)을 기본값으로 사용 (관세청 데이터는 전월 확정치가 매월 15일경 갱신됨)"""
    now = datetime.now()
    year, month = now.year, now.month - 1
    if month == 0:
        year -= 1
        month = 12
    return f"{year}{month:02d}"


def main():
    if not CUSTOMS_SERVICE_KEY or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("❌ 환경변수가 설정되지 않았습니다. .env.local 파일에 다음 값을 확인하세요:")
        print("   CUSTOMS_API_SERVICE_KEY / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY")
        sys.exit(1)

    yymm = sys.argv[1] if len(sys.argv) > 1 else get_default_yymm()
    prev_yymm = prev_year_yymm(yymm)

    print(f"=== 수출입동향 데이터 수집 시작: {yymm} (전년동월: {prev_yymm}) ===\n")

    skipped = []
    success_count = 0
    fail_count = 0

    for item_name, meta in ITEM_MAPPING.items():
        mode = meta["mode"]
        status = meta["status"]

        if mode == "heading":
            hs_codes = meta["hs_codes"]
            if not hs_codes:
                print(f"⏭️  {item_name} — HS코드 미매핑(미검증), 스킵")
                skipped.append(item_name)
                continue

            print(f"▶ {item_name} (HS 헤딩: {', '.join(hs_codes)})")
            try:
                curr_amount = sum_export_amount_by_heading(yymm, hs_codes)
                prev_amount = sum_export_amount_by_heading(prev_yymm, hs_codes)
            except requests.RequestException as e:
                print(f"  ❌ API 호출 실패: {e}")
                fail_count += 1
                continue
            saved_hs_codes = hs_codes

        elif mode == "hs_list":
            group_name = meta["group"]
            target_codes = HS_CODE_GROUPS.get(group_name)
            if not target_codes:
                print(f"⏭️  {item_name} — hs_code_groups.json에 '{group_name}' 그룹 없음, 스킵")
                skipped.append(item_name)
                continue

            n_headings = len(set(c[:4] for c in target_codes))
            print(f"▶ {item_name} (정밀목록 {len(target_codes)}개 코드, API 호출 {n_headings}회)")
            try:
                curr_amount = sum_export_amount_by_hs_list(yymm, target_codes)
                prev_amount = sum_export_amount_by_hs_list(prev_yymm, target_codes)
            except requests.RequestException as e:
                print(f"  ❌ API 호출 실패: {e}")
                fail_count += 1
                continue
            saved_hs_codes = target_codes

        else:
            print(f"⚠️  {item_name} — 알 수 없는 mode: {mode}, 스킵")
            skipped.append(item_name)
            continue

        yoy = calc_yoy_rate(curr_amount, prev_amount)

        print(f"  수출액: ${curr_amount:,.0f} | 전년동월: ${prev_amount:,.0f} | YoY: {yoy}%")

        ok = upsert_export_monthly(item_name, saved_hs_codes, yymm, curr_amount, yoy, status)
        if ok:
            print(f"  ✅ Supabase 저장 완료\n")
            success_count += 1
        else:
            fail_count += 1

    print("=== 수집 완료 ===")
    print(f"성공: {success_count}건 / 실패: {fail_count}건 / 스킵(미검증): {len(skipped)}건")
    if skipped:
        print(f"스킵된 품목: {', '.join(skipped)}")
        print("→ 8개 미검증 품목은 HS코드 매핑 완료 후 ITEM_MAPPING에 추가하면 자동으로 수집 대상에 포함됩니다.")


if __name__ == "__main__":
    main()