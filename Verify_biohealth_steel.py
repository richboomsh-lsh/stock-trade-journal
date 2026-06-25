# -*- coding: utf-8 -*-
"""
verify_biohealth_steel.py (v2 — 페이지네이션 버그 수정)

수정 사항 (v1 대비):
  - v1에서 hsSgn="72"(철강 류 전체) 조회 시, API가 pageNo를 무시하고
    매번 동일한 결과(284건)를 반환하는 현상이 발견됨. 이를 모르고
    10페이지를 그대로 누적 합산해 실제 금액의 약 10배(187.8억 달러)로
    부풀려졌었음.
  - v2에서는 매 페이지 응답을 이전 페이지와 비교해서, 내용이 동일하면
    즉시 페이지네이션을 중단하도록 수정 (중복 합산 방지).
  - 바이오헬스는 v1에서 HS30(의약품)만 조회해 -42.1% 이탈이 나왔으므로,
    HS90류 중 의료기기 추정 코드(9018/9021/9022)를 추가해 재검증.

보도자료 기준 (2026년 5월):
  - 철강     : 20.4억 달러 (-2.1%)
  - 바이오헬스: 14.4억 달러 (+5.2%)
"""

import re
import time
from urllib.parse import urlencode

import requests

# ----------------------------------------------------------------------
# 0. 설정값
# ----------------------------------------------------------------------

SERVICE_KEY = "6a7b5a5ea4e3d2dfbf7500d40c77310e75a2cae5f0b4d9312400be411c9276d7"

BASE_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

STRT_YYMM = 202605
END_YYMM = 202605

# 품목명: (HS코드 리스트, 보도자료 수출액(억 달러), 보도자료 증감률)
ITEMS = {
    "철강":       (["72"], 20.4, "-2.1%"),
    # HS90류 중 의료기기 추정 코드 추가: 9018(의료용기기), 9021(임플란트/보철/스텐트), 9022(X선기기)
    "바이오헬스": (["30", "9018", "9021", "9022"], 14.4, "+5.2%"),
}

NUM_OF_ROWS = 100
MAX_PAGES = 10
REQUEST_INTERVAL_SEC = 0.3


# ----------------------------------------------------------------------
# 1. API 호출
# ----------------------------------------------------------------------

def fetch_page(hs_code: str, page_no: int) -> str:
    params = {
        "strtYymm": STRT_YYMM,
        "endYymm": END_YYMM,
        "hsSgn": hs_code,
        "numOfRows": NUM_OF_ROWS,
        "pageNo": page_no,
    }
    query_string = urlencode(params)
    url = f"{BASE_URL}?serviceKey={SERVICE_KEY}&{query_string}"

    response = requests.get(url, timeout=10)
    return response.text


def parse_items(xml_text: str) -> list[dict]:
    """item 블록을 regex로 추출, 합계행(hsCode/statKor 빈값 또는 '-') 제외"""
    items = re.findall(r"<item>.*?</item>", xml_text, re.DOTALL)
    parsed = []
    excluded_total_row = None

    for item_str in items:
        exp_dlr_match = re.search(r"<expDlr>(.*?)</expDlr>", item_str)
        stat_kor_match = re.search(r"<statKor>(.*?)</statKor>", item_str)
        hs_code_match = re.search(r"<hsCode>(.*?)</hsCode>", item_str)

        exp_dlr = int(exp_dlr_match.group(1)) if exp_dlr_match else 0
        stat_kor = stat_kor_match.group(1) if stat_kor_match else ""
        hs_code = hs_code_match.group(1) if hs_code_match else ""

        if not hs_code.strip() or not stat_kor.strip() or hs_code.strip() == "-" or stat_kor.strip() == "-":
            excluded_total_row = exp_dlr
            continue

        parsed.append({"hsCode": hs_code.strip(), "statKor": stat_kor.strip(), "expDlr": exp_dlr})

    if excluded_total_row is not None:
        print(f"      ℹ 합계행 1건 제외 (금액: {excluded_total_row:,})")

    return parsed


def page_signature(items: list[dict]) -> tuple:
    """페이지 내용을 비교하기 위한 시그니처 (첫 항목 + 건수 + 총합으로 간단 비교)"""
    if not items:
        return (0, 0, None)
    total = sum(it["expDlr"] for it in items)
    first = (items[0]["hsCode"], items[0]["expDlr"])
    return (len(items), total, first)


def fetch_all_pages(hs_code: str) -> list[dict]:
    """
    numOfRows(100)를 넘는 세부품목을 페이지네이션으로 수집.
    단, API가 pageNo를 무시하고 동일 결과를 반복 반환하는 경우를 감지해서
    즉시 중단 (v1에서 발견된 버그 방지).
    """
    all_items = []
    prev_signature = None

    for page_no in range(1, MAX_PAGES + 1):
        xml_text = fetch_page(hs_code, page_no)

        if "<resultCode>00</resultCode>" not in xml_text:
            print(f"    ⚠ page {page_no} 정상 응답이 아닙니다. 원문 일부:")
            print("     ", xml_text[:300])
            break

        page_items = parse_items(xml_text)
        if not page_items:
            break  # 더 이상 데이터 없음

        current_signature = page_signature(page_items)

        # ⚠ 핵심 수정: 이전 페이지와 내용이 동일하면 API가 pageNo를 무시한 것으로
        # 판단하고 즉시 중단 (중복 합산 방지)
        if current_signature == prev_signature:
            print(f"    ⚠ page {page_no} 응답이 이전 페이지와 동일함 → "
                  f"API가 pageNo를 무시하는 것으로 판단, 페이지네이션 중단")
            break

        all_items.extend(page_items)
        print(f"    page {page_no}: {len(page_items)}건 수집 (누적 {len(all_items)}건)")

        if len(page_items) < NUM_OF_ROWS:
            break  # 마지막 페이지로 판단

        prev_signature = current_signature
        time.sleep(REQUEST_INTERVAL_SEC)

    return all_items


def get_item_total(hs_codes: list) -> tuple:
    """품목에 해당하는 HS코드(들)를 모두 조회해서 합산"""
    total = 0
    all_detail = []

    for hs_code in hs_codes:
        print(f"  [HS{hs_code}] 조회 중...")
        items = fetch_all_pages(hs_code)
        subtotal = sum(it["expDlr"] for it in items)
        total += subtotal
        all_detail.extend(items)
        print(f"    → HS{hs_code} 합계: {subtotal / 100_000_000:.2f}억 달러 ({len(items)}건)")
        time.sleep(REQUEST_INTERVAL_SEC)

    return total, all_detail


# ----------------------------------------------------------------------
# 2. 메인
# ----------------------------------------------------------------------

def main():
    print(f"조회 기간: {STRT_YYMM} ~ {END_YYMM}")
    print("=" * 70)

    results = {}

    for item_name, (hs_codes, report_value, report_growth) in ITEMS.items():
        print(f"\n[{item_name}] HS코드 {hs_codes} 조회 중...")
        total_dlr, detail_items = get_item_total(hs_codes)
        total_eok = total_dlr / 100_000_000

        print(f"  → {item_name} 전체 합계: {total_eok:.1f}억 달러 (세부품목 {len(detail_items)}건)")

        top_items = sorted(detail_items, key=lambda x: x["expDlr"], reverse=True)[:10]
        print(f"  상위 10개 세부품목:")
        for it in top_items:
            print(f"    - hsCode={it['hsCode']}, statKor={it['statKor']}, expDlr={it['expDlr']:,}")

        results[item_name] = (total_eok, report_value, report_growth)

    # ------------------------------------------------------------------
    # 결과 표
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("1차 검증 결과 (v2, 페이지네이션 버그 수정) — API 합계 vs 보도자료 (2026년 5월)")
    print("=" * 70)
    print(f"{'품목':<10}{'API 합계(억$)':>15}{'보도자료(억$)':>15}{'차이(%)':>12}{'보도 증감률':>14}")
    print("-" * 70)

    for item_name, (api_eok, report_value, report_growth) in results.items():
        diff_pct = (api_eok - report_value) / report_value * 100
        print(f"{item_name:<10}{api_eok:>15.1f}{report_value:>15.1f}{diff_pct:>+11.1f}%{report_growth:>14}")

    print("-" * 70)
    print("판정 기준(참고): ±20~30% 이내면 1차 검증 통과로 간주.")
    print("=" * 70)


if __name__ == "__main__":
    main()