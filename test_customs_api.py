"""
관세청_성질별 수출입실적(GW) API 테스트 호출 스크립트

사용법:
  python test_customs_api.py

주의:
  - SERVICE_KEY는 본인의 인증키로 교체하세요.
  - 이 스크립트는 Richmind님의 로컬 컴퓨터(또는 인터넷이 열린 환경)에서 실행해야 합니다.
"""

import requests
import json
from urllib.parse import urlencode, quote

# ===== 설정 =====
# data.go.kr 마이페이지에서 "인증키(Decoding)" 쪽을 복사해서 넣어주세요.
# (Encoding 키를 넣으면 이중 인코딩 문제로 500 에러가 발생합니다)
SERVICE_KEY = "6a7b5a5ea4e3d2dfbf7500d40c77310e75a2cae5f0b4d9312400be411c9276d7"
BASE_URL = "https://apis.data.go.kr/1220000/ldfytempertrade/getldfytempertradeList"

# ===== 파라미터 =====
# 정확한 파라미터명은 "요청변수(Request Parameter)" 탭에서 확인 필요.
# 아래는 일반적인 공공데이터포털 API 패턴을 따른 추정값입니다.
other_params = {
    "numOfRows": 20,
    "pageNo": 1,
    "year": "2026.04",   # YYYY.MM 형식 (점 포함) - 실제 샘플 응답 기준으로 수정
}

def main():
    # serviceKey는 절대 추가 인코딩하지 않고 그대로 붙임 (Decoding 키 사용 전제)
    # 나머지 파라미터만 urlencode로 인코딩
    query_string = urlencode(other_params)
    full_url = f"{BASE_URL}?serviceKey={SERVICE_KEY}&{query_string}"

    print(f"호출 URL (키 일부 가림): {full_url[:60]}...")
    print(f"파라미터: {json.dumps(other_params, ensure_ascii=False, indent=2)}")
    print("-" * 60)

    try:
        response = requests.get(full_url, timeout=10)
        print(f"HTTP 상태코드: {response.status_code}")
        print("-" * 60)
        print("응답 헤더:")
        for k, v in response.headers.items():
            print(f"  {k}: {v}")
        print("-" * 60)
        print("응답 본문 (전체):")
        print(response.text)

        # 응답이 JSON이면 보기 좋게 출력
        try:
            data = response.json()
            print("-" * 60)
            print("JSON 파싱 결과:")
            print(json.dumps(data, ensure_ascii=False, indent=2)[:3000])
        except ValueError:
            print("\n(JSON 파싱 실패 - XML 응답으로 보입니다. 위 텍스트를 확인하세요)")

    except requests.exceptions.RequestException as e:
        print(f"요청 중 오류 발생: {e}")


if __name__ == "__main__":
    main()