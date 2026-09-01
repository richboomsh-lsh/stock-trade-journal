"""
KIS Developers API 접근토큰(Access Token) 발급 테스트
- 실전투자 도메인 기준 (모의투자는 URL이 다름: openapivts.koreainvestment.com:29443)
- .env 파일에서 APP_KEY/APP_SECRET을 읽어와 토큰 발급 요청을 보내고,
  응답을 그대로 출력해서 정상 발급 여부를 확인한다.
"""

import os
import json
import requests
from dotenv import load_dotenv

# screening/.env 파일 로드
load_dotenv()

APP_KEY = os.getenv("KIS_APP_KEY")
APP_SECRET = os.getenv("KIS_APP_SECRET")

# 실전투자 도메인 (모의투자 테스트 시 아래 URL로 교체:
# https://openapivts.koreainvestment.com:29443)
BASE_URL = "https://openapi.koreainvestment.com:9443"


def get_access_token():
    if not APP_KEY or not APP_SECRET:
        print("❌ .env 파일에 KIS_APP_KEY / KIS_APP_SECRET이 설정되지 않았습니다.")
        print("   screening/.env 파일을 만들고 실제 발급받은 키를 넣어주세요.")
        return None

    url = f"{BASE_URL}/oauth2/tokenP"
    headers = {"content-type": "application/json"}
    body = {
        "grant_type": "client_credentials",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
    }

    print(f"→ 토큰 발급 요청 중... ({url})")
    response = requests.post(url, headers=headers, data=json.dumps(body))

    print(f"→ 응답 상태 코드: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        expires = data.get("access_token_token_expired")
        print("✅ 토큰 발급 성공!")
        print(f"   만료 시각: {expires}")
        print(f"   토큰 앞 10자리 (확인용): {token[:10]}...")
        return token
    else:
        print("❌ 토큰 발급 실패. 응답 내용:")
        print(response.text)
        return None


if __name__ == "__main__":
    get_access_token()
