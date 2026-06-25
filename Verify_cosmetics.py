# -*- coding: utf-8 -*-
"""
verify_cosmetics.py

목적:
  화장품 1차 검증에서 HS3304(기초화장품·메이크업) 단독으로 -16.1% 이탈이 나왔던 것을
  보완. 첨부된 산업통상부 보도자료 [참고3 세부 품목 예시]에서
  "화장품: 메이크업 및 기초화장품(마스크팩, 립스틱, 아이섀도 등), 세안용품, 샴푸 등"
  이라고 명시 — 샴푸·세안용품이 포함된다는 것이 확인됨.

  → 샴푸는 HS 3305(두발용제품), 세안용품은 HS 3401(비누) 또는 3304에 이미 포함될
    수도 있음. 우선 가장 유력한 3305를 추가해서 재검증.

보도자료 기준 (2026년 5월): 11.8억 달러 (+24.2%)

구조: 기존 스크립트들과 동일 패턴
  - serviceKey는 raw 문자열로 URL에 직접 붙임 (이중 인코딩 방지)
  - numOfRows=100, pageNo=1 명시
  - <resultCode>00</resultCode> 체크
  - 합계행(hsCode/statKor가 빈 값 또는 '-') 제외 처리
  - 페이지네이션 중복 응답 감지 (이전 verify_biohealth_steel.py에서 발견된
    pageNo 무시 버그에 대한 방어 로직 포함)
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

REPORT_VALUE_EOK = 11.8
REPORT_GROWTH = "+24.2%"

# 단계별로 비교할 케이스들
CASES = {
    "3304 단독 (기존)":        ["3304"],
    "3304 + 3305 (샴푸 추가)":  ["3304", "3305"],
    "3304 + 3305 + 3401 (비누 추가)": ["3304", "3305", "3401"],
    "3303~3307 전체 (33류 화장품 챕터)": ["3303", "3304", "3305", "3306", "3307"],
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


def page_signature(items: list) -> tuple:
    if not items:
        return (0, 0, None)
    total = sum(it["expDlr"] for it in items)
    first = (items[0]["hsCode"], items[0]["expDlr"])
    return (len(items), total, first)


def fetch_all_pages(hs_code: str) -> list:
    """페이지네이션 + 중복 응답 감지(pageNo 무시 버그 방어)"""
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
            break

        current_signature = page_signature(page_items)
        if current_signature == prev_signature:
            break  # API가 pageNo 무시 → 중복 합산 방지

        all_items.extend(page_items)

        if len(page_items) < NUM_OF_ROWS:
            break

        prev_signature = current_signature
        time.sleep(REQUEST_INTERVAL_SEC)

    return all_items


def get_hs_total(hs_code: str) -> tuple:
    """단일 HS코드 합계 + 세부품목 리스트"""
    items = fetch_all_pages(hs_code)
    total = sum(it["expDlr"] for it in items)
    return total, items


# ----------------------------------------------------------------------
# 2. 메인 — 케이스별 비교
# ----------------------------------------------------------------------

def main():
    print(f"조회 기간: {STRT_YYMM} ~ {END_YYMM}")
    print(f"보도자료 기준 화장품 수출액: {REPORT_VALUE_EOK}억 달러 ({REPORT_GROWTH})")
    print("=" * 70)

    # 각 HS코드는 케이스 간 중복되므로 한 번만 조회하고 캐싱
    cache = {}
    all_codes = set()
    for codes in CASES.values():
        all_codes.update(codes)

    for hs_code in sorted(all_codes):
        print(f"\n[HS{hs_code}] 조회 중...")
        total, items = get_hs_total(hs_code)
        cache[hs_code] = (total, items)
        print(f"  → 합계: {total / 100_000_000:.2f}억 달러 ({len(items)}건)")

        # 상위 5개 세부품목만 출력
        top5 = sorted(items, key=lambda x: x["expDlr"], reverse=True)[:5]
        for it in top5:
            print(f"    - hsCode={it['hsCode']}, statKor={it['statKor']}, expDlr={it['expDlr']:,}")

        time.sleep(REQUEST_INTERVAL_SEC)

    # ------------------------------------------------------------------
    # 케이스별 결과 표
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("케이스별 비교 결과")
    print("=" * 70)
    print(f"{'케이스':<32}{'합계(억$)':>12}{'보도자료(억$)':>14}{'차이(%)':>10}")
    print("-" * 70)

    for case_name, codes in CASES.items():
        total_dlr = sum(cache[c][0] for c in codes)
        total_eok = total_dlr / 100_000_000
        diff_pct = (total_eok - REPORT_VALUE_EOK) / REPORT_VALUE_EOK * 100
        print(f"{case_name:<32}{total_eok:>12.1f}{REPORT_VALUE_EOK:>14.1f}{diff_pct:>+9.1f}%")

    print("-" * 70)
    print("판정 기준(참고): ±20~30% 이내면 1차 검증 통과로 간주.")
    print("=" * 70)


if __name__ == "__main__":
    main()