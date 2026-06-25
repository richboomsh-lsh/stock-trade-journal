# -*- coding: utf-8 -*-
"""
verify_hbm_trend.py

목적:
    관세청_품목별 수출입실적(GW) API를 이용해
    HS코드 8542321010(디램) vs 8542323000(복합구조칩 집적회로, HBM 포함 추정)
    두 코드의 2025.12 ~ 2026.05 (6개월) 수출액 시계열을 뽑아 증가율을 비교한다.

전제 (verify_semiconductor_mapping.py 와 동일한 패턴 사용):
    1) 서비스키는 다른 파라미터와 함께 urlencode()에 넣지 않고 raw 문자열로
       URL에 직접 붙인다. (이유: requests/urlencode가 자동으로 다시 인코딩하면서
       서비스키에 포함된 특수문자가 이중 인코딩되어 인증 실패가 날 수 있음)
    2) numOfRows / pageNo를 명시적으로 넉넉히 지정한다.
       (기본값이 작을 경우 세부품목이 잘려서 합계가 틀어질 수 있음)
    3) 응답에 <resultCode>00</resultCode>가 없으면 정상 응답이 아니므로
       바로 원문을 출력하고 건너뛴다. (조용히 실패하지 않도록)
    4) 응답 안에 끼어드는 합계행(hsCode/statKor가 빈 값 또는 "-")은
       개별 품목이 아니므로 반드시 제외하고 합산한다.

사용법:
    SERVICE_KEY 변수에 발급받은 서비스키를 그대로 붙여넣고 실행.
    (이 파일을 GitHub 등에 올릴 경우 키가 노출되므로 .gitignore 처리 권장.
     필요하다면 환경변수로 분리해도 되지만, verify_semiconductor_mapping.py와
     동일한 방식을 유지하기 위해 여기서는 변수에 직접 넣는 형태로 둠)
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

# 비교 대상 HS코드 (10단위)
HS_DRAM = "8542321010"          # 디램 (HBM 미포함 추정)
HS_MCP = "8542323000"           # 복합구조칩 집적회로 (HBM 포함 추정)

TARGET_CODES = {
    HS_DRAM: "디램",
    HS_MCP: "복합구조칩 집적회로(HBM 포함 추정)",
}

# 조회할 6개월
MONTHS = ["202512", "202601", "202602", "202603", "202604", "202605"]

REQUEST_INTERVAL_SEC = 0.3  # API 과호출 방지용 딜레이
NUM_OF_ROWS = 100            # 세부품목이 여러 개일 수 있으므로 넉넉히


# ----------------------------------------------------------------------
# 1. API 호출 (verify_semiconductor_mapping.py와 동일한 URL 구성 방식)
# ----------------------------------------------------------------------

def fetch_hs_code(hs_code: str, yymm: str) -> str:
    """
    특정 HS코드 + 특정 월(yymm)을 조회해서 XML 원문(text)을 반환.
    serviceKey는 별도로 raw하게 붙여서 이중 인코딩을 피한다.
    """
    params = {
        "strtYymm": yymm,
        "endYymm": yymm,
        "hsSgn": hs_code,
        "numOfRows": NUM_OF_ROWS,
        "pageNo": 1,
    }
    query_string = urlencode(params)
    url = f"{BASE_URL}?serviceKey={SERVICE_KEY}&{query_string}"

    response = requests.get(url, timeout=10)
    return response.text


# ----------------------------------------------------------------------
# 2. 파싱 (합계행 제외 로직 포함, regex 기반 — 원본과 동일 방식)
# ----------------------------------------------------------------------

def parse_items(xml_text: str) -> list[dict]:
    """
    item 블록을 regex로 추출해 hsCode/statKor/expDlr를 파싱.
    hsCode 또는 statKor가 빈 값이거나 "-"인 행은 합계행으로 간주하고 제외.
    """
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
        print(f"    ℹ 합계행으로 추정되는 항목 1건 제외함 (금액: {excluded_total_row:,})")

    return parsed


def get_target_value(hs_code: str, yymm: str) -> int:
    """
    특정 월(yymm)에서 특정 HS코드(hs_code)의 수출액(달러) 합계를 가져온다.
    hsSgn으로 필터링해서 호출하지만, 응답에 다른 세부코드가 섞여 올 가능성에
    대비해 hsCode가 정확히 일치하는 행만 한 번 더 필터링한다.
    """
    xml_text = fetch_hs_code(hs_code, yymm)

    if "<resultCode>00</resultCode>" not in xml_text:
        print(f"    ⚠ [{yymm}] {hs_code} 정상 응답이 아닙니다. 원문 일부:")
        print("     ", xml_text[:300])
        return 0

    items = parse_items(xml_text)
    matched = [it for it in items if it["hsCode"] == hs_code]

    if not matched:
        # hsSgn 필터링이 prefix 매칭이라 다른 하위코드가 섞여 왔을 가능성 → 안내
        if items:
            print(f"    ℹ [{yymm}] {hs_code} 정확히 일치하는 행이 없음. "
                  f"응답에 포함된 코드: {[it['hsCode'] for it in items]}")
        return 0

    return sum(it["expDlr"] for it in matched)


# ----------------------------------------------------------------------
# 3. 시계열 수집
# ----------------------------------------------------------------------

def collect_timeseries() -> dict:
    """
    {hs_code: {yymm: expDlr}} 형태로 6개월치 수집
    """
    result = {hs: {} for hs in TARGET_CODES}

    for yymm in MONTHS:
        for hs_code, name in TARGET_CODES.items():
            value = get_target_value(hs_code, yymm)
            result[hs_code][yymm] = value
            print(f"  [{yymm}] {name} ({hs_code}) = {value:,} 달러")
            time.sleep(REQUEST_INTERVAL_SEC)

    return result


# ----------------------------------------------------------------------
# 4. 증가율 계산 + 출력
# ----------------------------------------------------------------------

def pct_change(prev: int, curr: int) -> str:
    if prev == 0:
        return "N/A"
    rate = (curr - prev) / prev * 100
    return f"{rate:+.1f}%"


def print_report(series: dict) -> None:
    print("\n" + "=" * 78)
    print("디램 vs HBM 추정코드 6개월 시계열 비교 (2025.12 ~ 2026.05)")
    print("=" * 78)

    header = f"{'월':<8}"
    for hs_code, name in TARGET_CODES.items():
        header += f"{name[:14]:>18}"
    print(header)
    print("-" * 78)

    for yymm in MONTHS:
        row = f"{yymm:<8}"
        for hs_code in TARGET_CODES:
            val = series[hs_code][yymm]
            row += f"{val:>18,}"
        print(row)

    print("-" * 78)

    # 전체 기간(첫 달 → 마지막 달) 증가율
    first, last = MONTHS[0], MONTHS[-1]
    print(f"\n[전체 구간 증가율: {first} → {last}]")
    growth_rates = {}
    for hs_code, name in TARGET_CODES.items():
        prev_val = series[hs_code][first]
        curr_val = series[hs_code][last]
        rate_str = pct_change(prev_val, curr_val)
        growth_rates[hs_code] = (prev_val, curr_val, rate_str)
        print(f"  - {name} ({hs_code}): {prev_val:,} → {curr_val:,}  ({rate_str})")

    # 월별 전월대비 증가율 표
    print(f"\n[월별 전월대비 증가율]")
    header2 = f"{'월':<8}"
    for hs_code, name in TARGET_CODES.items():
        header2 += f"{name[:14]:>18}"
    print(header2)
    print("-" * 78)
    for i, yymm in enumerate(MONTHS):
        row = f"{yymm:<8}"
        for hs_code in TARGET_CODES:
            if i == 0:
                row += f"{'(기준월)':>18}"
            else:
                prev_val = series[hs_code][MONTHS[i - 1]]
                curr_val = series[hs_code][yymm]
                row += f"{pct_change(prev_val, curr_val):>18}"
        print(row)

    # 결론 힌트
    print("\n" + "=" * 78)
    dram_rate = growth_rates[HS_DRAM][2]
    mcp_rate = growth_rates[HS_MCP][2]
    print(f"디램 전체 증가율: {dram_rate} / HBM 추정코드 전체 증가율: {mcp_rate}")

    try:
        dram_pct = float(dram_rate.strip('%').replace('+', ''))
        mcp_pct = float(mcp_rate.strip('%').replace('+', ''))
        if mcp_pct > dram_pct:
            diff = mcp_pct - dram_pct
            print(f"→ HBM 추정코드가 디램보다 {diff:.1f}%p 더 가파르게 증가함")
            print("  (HBM 매핑이 합리적이라는 추가 신호로 해석 가능 — 단, 정황적 근거일 뿐 확정 아님)")
        else:
            print("→ HBM 추정코드가 디램보다 더 가파르게 증가하지 않음")
            print("  (HBM 매핑 가정을 재검토할 필요 있음 — CLIP 정식 품명 확인 권장)")
    except ValueError:
        print("→ 증가율 비교 불가 (N/A 값 존재, 기준월 데이터 확인 필요)")
    print("=" * 78)


# ----------------------------------------------------------------------
# 5. 메인
# ----------------------------------------------------------------------

if __name__ == "__main__":
    print(f"6개월 시계열 데이터 수집 시작 ({MONTHS[0]} ~ {MONTHS[-1]})...\n")
    series = collect_timeseries()
    print_report(series)