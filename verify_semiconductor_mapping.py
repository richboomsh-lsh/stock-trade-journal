"""
반도체 HS코드 매핑 검증 스크립트

목적:
  HS코드 8541(다이오드/트랜지스터), 8542(집적회로)로 조회한
  2026년 5월 수출액 합계가, 산업통상부 보도자료의
  "반도체 수출 371.6억 달러"와 비슷한 규모로 나오는지 확인.

주의:
  hsSgn 파라미터가 정확히 4단위 코드를 어떻게 받아들이는지(완전일치 vs 앞자리 매칭)
  모르기 때문에, 우선 그대로 시도해보고 결과(건수, 합계)를 관찰합니다.
"""

import requests
from urllib.parse import urlencode

SERVICE_KEY = "6a7b5a5ea4e3d2dfbf7500d40c77310e75a2cae5f0b4d9312400be411c9276d7"
BASE_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

# 조회 대상 HS코드 (반도체 추정 코드)
HS_CODES_TO_TEST = [8541, 8542]

# 조회 기간 - 2026년 5월
STRT_YYMM = 202605
END_YYMM = 202605


def fetch_hs_code(hs_code):
    """특정 HS코드로 데이터를 조회하고 item 리스트(딕셔너리)를 반환"""
    params = {
        "strtYymm": STRT_YYMM,
        "endYymm": END_YYMM,
        "hsSgn": hs_code,
        "numOfRows": 100,   # 세부품목이 여러 개일 수 있으므로 넉넉히
        "pageNo": 1,
    }
    query_string = urlencode(params)
    url = f"{BASE_URL}?serviceKey={SERVICE_KEY}&{query_string}"

    response = requests.get(url, timeout=10)
    return response.text


def parse_items(xml_text):
    """간단한 XML 파싱 - expDlr, statKor, hsCode 추출
    주의: 관세청 API는 응답 맨 앞(또는 뒤)에 hsCode/statKor가 빈 '합계행'을
    끼워넣는 경우가 있음. 이를 개별 품목으로 잘못 합산하지 않도록 제외 처리.
    """
    import re
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

        # hsCode 또는 statKor이 비어있거나 '-'면 '합계행'으로 간주하고 제외
        if not hs_code.strip() or not stat_kor.strip() or hs_code.strip() == "-" or stat_kor.strip() == "-":
            excluded_total_row = exp_dlr
            continue

        parsed.append({"hsCode": hs_code, "statKor": stat_kor, "expDlr": exp_dlr})

    if excluded_total_row is not None:
        print(f"  ℹ 합계행으로 추정되는 항목 1건 제외함 (금액: {excluded_total_row:,})")

    return parsed


def main():
    total_sum = 0
    print(f"조회 기간: {STRT_YYMM} ~ {END_YYMM}")
    print("=" * 60)

    for hs_code in HS_CODES_TO_TEST:
        print(f"\n[HS코드 {hs_code}] 조회 중...")
        xml_text = fetch_hs_code(hs_code)

        # 정상 응답인지 간단 확인
        if "<resultCode>00</resultCode>" not in xml_text:
            print("  ⚠ 정상 응답이 아닙니다. 원문 일부 출력:")
            print(" ", xml_text[:300])
            continue

        items = parse_items(xml_text)
        subtotal = sum(item["expDlr"] for item in items)
        total_sum += subtotal

        print(f"  세부품목 수: {len(items)}건")
        print(f"  수출액 합계(달러): {subtotal:,}")

        # 세부품목 전체 출력 (금액 큰 순으로 정렬)
        items_sorted = sorted(items, key=lambda x: x["expDlr"], reverse=True)
        for item in items_sorted:
            print(f"    - hsCode={item['hsCode']}, statKor={item['statKor']}, expDlr={item['expDlr']:,}")

    print("\n" + "=" * 60)
    print(f"총 합계(달러): {total_sum:,}")
    print(f"총 합계(억 달러 환산): {total_sum / 100_000_000:.1f}")
    print("-" * 60)
    print("보도자료 기준 반도체 수출(2026.5): 371.6억 달러")
    print("위 두 숫자가 비슷한 규모면 매핑이 유효하다는 신호입니다.")


if __name__ == "__main__":
    main()