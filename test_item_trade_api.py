"""
관세청_품목별 수출입실적(GW) API 테스트 호출 스크립트

확인된 필수 파라미터:
  - serviceKey (필수)
  - strtYymm   (필수) 시작년월, 예: 202604
  - endYymm    (필수) 종료년월, 예: 202605
  - hsSgn      (선택) 품목코드 - 비우면 전체 품목 조회될 것으로 추정

사용법:
  python test_item_trade_api.py
"""

import requests
from urllib.parse import urlencode

# ===== 설정 =====
SERVICE_KEY = "6a7b5a5ea4e3d2dfbf7500d40c77310e75a2cae5f0b4d9312400be411c9276d7"
BASE_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

# ===== 파라미터 =====
other_params = {
    "strtYymm": 202604,
    "endYymm": 202605,
    # "hsSgn": 8541,   # 필요시 특정 HS코드로 필터링 (지금은 비워서 전체 조회 시도)
}


def main():
    query_string = urlencode(other_params)
    full_url = f"{BASE_URL}?serviceKey={SERVICE_KEY}&{query_string}"

    print(f"호출 URL (키 일부 가림): {full_url[:70]}...")
    print(f"파라미터: {other_params}")
    print("-" * 60)

    try:
        response = requests.get(full_url, timeout=10)
        print(f"HTTP 상태코드: {response.status_code}")
        print("-" * 60)
        print("응답 본문 (앞부분 3000자):")
        print(response.text[:3000])
    except requests.exceptions.RequestException as e:
        print(f"요청 중 오류 발생: {e}")


if __name__ == "__main__":
    main()