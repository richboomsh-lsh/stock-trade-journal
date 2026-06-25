"""
기상청_단기예보 조회서비스 테스트 호출 스크립트

목적:
  관세청 API에서 발생한 "Unexpected errors"가
  - data.go.kr 게이트웨이/계정 전반의 문제인지
  - 관세청 API 자체의 문제인지
  를 구분하기 위한 교차 테스트.

사용법:
  python test_weather_api.py
"""

import requests
from urllib.parse import urlencode
from datetime import datetime, timedelta

# ===== 설정 =====
SERVICE_KEY = "6a7b5a5ea4e3d2dfbf7500d40c77310e75a2cae5f0b4d9312400be411c9276d7"
BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"

# ===== 파라미터 =====
# 기상청 단기예보는 base_date(발표일자), base_time(발표시각)을 정확히 맞춰야 함.
# 발표시각은 02,05,08,11,14,17,20,23시 단위로만 존재.
# 안전하게 "오늘 02:00" 발표분을 사용 (이미 지난 시각이라 항상 데이터 있음).
today = datetime.now().strftime("%Y%m%d")

other_params = {
    "numOfRows": 10,
    "pageNo": 1,
    "dataType": "JSON",
    "base_date": today,
    "base_time": "0200",
    "nx": 60,   # 서울 종로구 기준 격자 좌표 (예시)
    "ny": 127,
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
        print("응답 본문 (전체):")
        print(response.text)
    except requests.exceptions.RequestException as e:
        print(f"요청 중 오류 발생: {e}")


if __name__ == "__main__":
    main()