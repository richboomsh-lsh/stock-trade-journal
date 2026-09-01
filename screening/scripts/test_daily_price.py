"""
KIS Developers API - 국내주식기간별시세(일별) 테스트
- 삼성전자(005930)로 최근 30일치 일별 거래량/거래대금/등락률 데이터 확인
"""

import os
import json
from datetime import datetime, timedelta
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


def get_daily_price(token, stock_code, days=30):
    url = f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": "FHKST03010100",
        "custtype": "P",
    }

    end_date = datetime.now().strftime("%Y%m%d")
    start_date = (datetime.now() - timedelta(days=days * 2)).strftime("%Y%m%d")
    # 주말/공휴일 감안해서 넉넉히 2배 기간으로 요청 후 실제 영업일만 추림

    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": stock_code,
        "FID_INPUT_DATE_1": start_date,
        "FID_INPUT_DATE_2": end_date,
        "FID_PERIOD_DIV_CODE": "D",   # D: 일봉
        "FID_ORG_ADJ_PRC": "0",       # 0: 수정주가 미반영
    }

    print(f"→ {stock_code} 일별시세 조회 중... ({start_date} ~ {end_date})")
    response = requests.get(url, headers=headers, params=params)
    print(f"→ 응답 상태 코드: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"→ rt_cd(성공여부): {data.get('rt_cd')}  msg: {data.get('msg1')}")

        output2 = data.get("output2", [])
        print(f"→ 일별 데이터 건수: {len(output2)}")

        if output2:
            print("\n✅ 가장 최근 거래일 원본 데이터:")
            print(json.dumps(output2[0], ensure_ascii=False, indent=2))
            print("\n✅ 그 다음 거래일 원본 데이터:")
            if len(output2) > 1:
                print(json.dumps(output2[1], ensure_ascii=False, indent=2))
        return data
    else:
        print("❌ 조회 실패. 응답 내용:")
        print(response.text)
        return None


if __name__ == "__main__":
    token = get_access_token()
    if token:
        get_daily_price(token, TEST_STOCK_CODE)
