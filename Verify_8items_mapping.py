# -*- coding: utf-8 -*-
"""
verify_8items_mapping.py

목적:
  자동차/자동차부품/디스플레이/무선통신기기/컴퓨터/이차전지/화장품/석유제품/선박
  8개(+1, 이차전지는 비교 수치 없이 조회만) 품목의 HS코드 조회 합계가,
  산업통상부 '2026년 5월 수출입 동향' 보도자료 수치와 비슷한 규모로 나오는지
  1차 검증(규모 대조)만 빠르게 수행.

구조: verify_semiconductor_mapping.py 와 동일한 패턴 그대로 재사용
  - serviceKey는 raw 문자열로 URL에 직접 붙임 (이중 인코딩 방지)
  - numOfRows=100, pageNo=1 명시
  - <resultCode>00</resultCode> 체크로 정상 응답 확인
  - hsCode/statKor가 빈 값 또는 "-"인 합계행 제외 처리

주의:
  - 일부 품목(자동차부품, 선박)은 HS코드가 여러 개로 분산되어 있어
    여러 hsSgn을 순회하며 합산함.
  - hsSgn 파라미터가 4단위 코드를 앞자리 매칭(prefix)으로 처리하는 것으로
    추정되므로(이전 반도체 검증에서 확인), 여기서도 동일하게 4단위 그대로 사용.
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

# 품목명: (HS코드 리스트, 보도자료 수출액(억 달러) 또는 None, 보도자료 증감률 또는 None)
ITEMS = {
    "디스플레이":     (["8524"], 14.7, "+9.4%"),
    "무선통신기기":   (["8517"], 14.6, "+12.6%"),
    "컴퓨터":         (["8471"], 41.8, "+290.7%"),
    "자동차":         (["8703"], 58.3, "-5.9%"),
    "자동차부품":     (["8708"], 16.0, "-2.5%"),
    "이차전지":       (["8507"], None, "두 자릿수 성장(정확한 수치 미확인)"),
    "화장품":         (["3304"], 11.8, "+24.2%"),
    "석유제품":       (["2710"], 52.5, "+46.6%"),
    "선박":           (["8901", "8902", "8903", "8904", "8905", "8906", "8907", "8908"], 26.1, "+16.7%"),
}

REQUEST_INTERVAL_SEC = 0.3


# ----------------------------------------------------------------------
# 1. API 호출 (verify_semiconductor_mapping.py와 동일한 URL 구성 방식)
# ----------------------------------------------------------------------

def fetch_hs_code(hs_code: str) -> str:
    """특정 HS코드로 데이터를 조회하고 XML 원문(text)을 반환"""
    params = {
        "strtYymm": STRT_YYMM,
        "endYymm": END_YYMM,
        "hsSgn": hs_code,
        "numOfRows": 100,
        "pageNo": 1,
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
        print(f"    ℹ 합계행 1건 제외 (금액: {excluded_total_row:,})")

    return parsed


# ----------------------------------------------------------------------
# 2. 품목별 조회 + 합산
# ----------------------------------------------------------------------

def get_item_total(hs_codes: list) -> tuple:
    """
    품목에 해당하는 HS코드(들)를 모두 조회해서 합산.
    반환값: (총합(달러), 세부품목 리스트)
    """
    total = 0
    all_detail_items = []

    for hs_code in hs_codes:
        xml_text = fetch_hs_code(hs_code)

        if "<resultCode>00</resultCode>" not in xml_text:
            print(f"    ⚠ HS{hs_code} 정상 응답이 아닙니다. 원문 일부:")
            print("     ", xml_text[:300])
            time.sleep(REQUEST_INTERVAL_SEC)
            continue

        detail_items = parse_items(xml_text)
        subtotal = sum(it["expDlr"] for it in detail_items)
        total += subtotal
        all_detail_items.extend(detail_items)

        print(f"    - HS{hs_code}: 세부품목 {len(detail_items)}건, 합계 {subtotal:,} 달러")
        time.sleep(REQUEST_INTERVAL_SEC)

    return total, all_detail_items


# ----------------------------------------------------------------------
# 3. 메인 — 8개 품목 순회 + 보도자료 대조
# ----------------------------------------------------------------------

def main():
    print(f"조회 기간: {STRT_YYMM} ~ {END_YYMM}")
    print("=" * 70)

    results = {}

    for item_name, (hs_codes, report_value, report_growth) in ITEMS.items():
        print(f"\n[{item_name}] HS코드 {hs_codes} 조회 중...")
        total_dlr, _ = get_item_total(hs_codes)
        total_eok = total_dlr / 100_000_000  # 억 달러 환산
        results[item_name] = (total_eok, report_value, report_growth)
        print(f"  → API 합계: {total_eok:.1f}억 달러")

    # ------------------------------------------------------------------
    # 결과 표
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("1차 검증 결과 — API 합계 vs 보도자료 수치 (2026년 5월)")
    print("=" * 70)
    print(f"{'품목':<10}{'API 합계(억$)':>15}{'보도자료(억$)':>15}{'차이(%)':>12}{'보도 증감률':>16}")
    print("-" * 70)

    for item_name, (api_eok, report_value, report_growth) in results.items():
        if report_value is None:
            diff_str = "N/A"
            report_str = "미확인"
        else:
            diff_pct = (api_eok - report_value) / report_value * 100
            diff_str = f"{diff_pct:+.1f}%"
            report_str = f"{report_value:.1f}"
        print(f"{item_name:<10}{api_eok:>15.1f}{report_str:>15}{diff_str:>12}{report_growth:>16}")

    print("-" * 70)
    print("판정 기준(참고): 반도체 검증 때 약 20% 차이를 분류기준 차이로 '합리적 수준'으로 판단했음.")
    print("→ ±20~30% 이내면 1차 검증 통과로 간주, 그 이상 벗어나면 매핑 재검토 필요.")
    print("=" * 70)


if __name__ == "__main__":
    main()