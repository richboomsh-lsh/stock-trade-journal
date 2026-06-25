# -*- coding: utf-8 -*-
"""
verify_computer_ssd.py

목적:
  컴퓨터 품목 1차 검증에서 -98.0% 라는 큰 이탈이 나온 원인을 확인.
  보도자료에 따르면 2026년 5월 컴퓨터 수출 급증(290.7%)의 핵심은
  AI 서버용 SSD(솔리드스테이트드라이브) 수요였음 — 즉 HS 8471(컴퓨터 본체류)만으로는
  SSD가 잡히지 않을 가능성이 높음.

  SSD는 관세율표상 HS 8523(저장매체 - 솔리드스테이트 비휘발성 저장장치 등)에
  분류되는 것으로 추정됨. 8471 단독 vs 8471+8523 합산을 비교해서
  보도자료 수치(41.8억 달러)에 더 근접하는지 확인.

구조: verify_semiconductor_mapping.py / verify_8items_mapping.py 와 동일 패턴
  - serviceKey는 raw 문자열로 URL에 직접 붙임 (이중 인코딩 방지)
  - numOfRows=100, pageNo=1 명시
  - <resultCode>00</resultCode> 체크
  - 합계행(hsCode/statKor가 빈 값 또는 "-") 제외 처리

이번엔 세부품목 내역도 함께 출력해서, 8523 안에 SSD 외에 다른 품목이
섞여 들어오는지(과대 포함 여부)도 같이 확인할 수 있게 함.
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

HS_COMPUTER = "8471"   # 컴퓨터 본체/주변기기
HS_SSD = "8523"        # 저장매체 (SSD 추정 위치)

REPORT_VALUE_EOK = 41.8   # 보도자료 기준 컴퓨터 수출액 (억 달러)
REPORT_GROWTH = "+290.7%"

REQUEST_INTERVAL_SEC = 0.3


# ----------------------------------------------------------------------
# 1. API 호출 (기존 스크립트와 동일한 URL 구성 방식)
# ----------------------------------------------------------------------

def fetch_hs_code(hs_code: str) -> str:
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


def fetch_and_show(hs_code: str, label: str) -> tuple:
    """조회 + 세부품목 내역 전체 출력 + 합계 반환"""
    print(f"\n[HS{hs_code}] {label} 조회 중...")
    xml_text = fetch_hs_code(hs_code)

    if "<resultCode>00</resultCode>" not in xml_text:
        print("  ⚠ 정상 응답이 아닙니다. 원문 일부:")
        print(" ", xml_text[:300])
        return 0, []

    items = parse_items(xml_text)
    subtotal = sum(it["expDlr"] for it in items)

    print(f"  세부품목 수: {len(items)}건 / 합계: {subtotal:,} 달러 ({subtotal / 100_000_000:.1f}억 달러)")

    # 금액 큰 순으로 정렬해서 전체 출력 (어떤 세부품목이 섞여있는지 확인용)
    items_sorted = sorted(items, key=lambda x: x["expDlr"], reverse=True)
    for it in items_sorted:
        print(f"    - hsCode={it['hsCode']}, statKor={it['statKor']}, expDlr={it['expDlr']:,}")

    return subtotal, items


# ----------------------------------------------------------------------
# 2. 메인
# ----------------------------------------------------------------------

def main():
    print(f"조회 기간: {STRT_YYMM} ~ {END_YYMM}")
    print("=" * 70)

    computer_total, computer_items = fetch_and_show(HS_COMPUTER, "컴퓨터 본체/주변기기")
    time.sleep(REQUEST_INTERVAL_SEC)

    ssd_total, ssd_items = fetch_and_show(HS_SSD, "저장매체 (SSD 추정)")

    combined_total = computer_total + ssd_total
    combined_eok = combined_total / 100_000_000

    print("\n" + "=" * 70)
    print("결과 비교")
    print("=" * 70)

    cases = [
        ("8471 단독", computer_total / 100_000_000),
        ("8523 단독", ssd_total / 100_000_000),
        ("8471 + 8523 합산", combined_eok),
    ]

    for label, value_eok in cases:
        diff_pct = (value_eok - REPORT_VALUE_EOK) / REPORT_VALUE_EOK * 100
        print(f"  {label:<20}: {value_eok:>8.1f}억 달러  (보도자료 {REPORT_VALUE_EOK}억 달러 대비 {diff_pct:+.1f}%)")

    print("-" * 70)
    print(f"보도자료 기준: 컴퓨터 수출 {REPORT_VALUE_EOK}억 달러 ({REPORT_GROWTH})")
    print("판정: 8471+8523 합산 결과가 ±20~30% 이내로 들어오면, SSD가 8523에")
    print("      분류된다는 가정이 합리적이라는 신호로 해석 가능.")
    print("=" * 70)


if __name__ == "__main__":
    main()