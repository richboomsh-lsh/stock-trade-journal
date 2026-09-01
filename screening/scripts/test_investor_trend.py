"""
KIS Developers API - 종목별 투자자매매동향(최근 30거래일) 테스트
- 삼성전자(005930)로 먼저 테스트, 외국인/기관 순매수 데이터가
  스크리닝 로직에서 쓸 수 있는 형태로 오는지 응답 원본을 확인한다.
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

APP_KEY = os.getenv("KIS_APP_KEY")
APP_SECRET = os.getenv("KIS_APP_SECRET")
BASE_URL = "https://openapi.koreainvestment.com:9443"

TEST_STOCK_CODE = "005930"  # 삼성전자


def get_access_token():
    url = f"{BASE_URL}/oauth2/tokenP"
    headers = {"content-type": "application/json"}
    body = {
        "grant_type": "client_credentials",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
    }
    response = requests.post(url, headers=headers, data=json.dumps(body))
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print("❌ 토큰 발급 실패:", response.text)
        return None


def get_investor_trend(token, stock_code):
    url = f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor"
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": "FHKST01010900",
        "custtype": "P",
    }
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",   # J: 주식/ETF/ETN
        "FID_INPUT_ISCD": stock_code,     # 종목코드 6자리
    }

    print(f"→ {stock_code} 투자자매매동향 조회 중...")
    response = requests.get(url, headers=headers, params=params)
    print(f"→ 응답 상태 코드: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"→ rt_cd(성공여부): {data.get('rt_cd')}  msg: {data.get('msg1')}")

        output = data.get("output", [])
        print(f"→ 응답 데이터 건수(최근 거래일 수): {len(output)}")

        if output:
            print("\n✅ 가장 최근 1건 원본 데이터:")
            print(json.dumps(output[0], ensure_ascii=False, indent=2))
        if len(output) > 1:
            print("\n✅ 그 다음 1건(2번째) 원본 데이터:")
            print(json.dumps(output[1], ensure_ascii=False, indent=2))
        return data
    else:
        print("❌ 조회 실패. 응답 내용:")
        print(response.text)
        return None


if __name__ == "__main__":
    token = get_access_token()
    if token:
        get_investor_trend(token, TEST_STOCK_CODE)
