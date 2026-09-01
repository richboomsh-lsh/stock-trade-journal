"""
screening/scripts/test_common_utils.py

kis_common.py(토큰 발급 + Rate Limiter + 재시도)가 실제로 잘 동작하는지
5개 종목으로 확인하는 테스트 스크립트.

확인 포인트:
    1. 토큰이 1번만 발급되고, 이후 API 호출에 재사용되는지
    2. 투자자매매동향 + 일별시세 API를 5종목 × 2건 = 10건 호출하는 동안
       Rate Limiter가 오류 없이 동작하는지 (10건이라 실제 대기가 발동되지 않을
       수도 있음 — 그래도 정상. 전체 2,720종목으로 확장했을 때 진가를 발휘함)
    3. 각 종목의 핵심 필드(외국인/기관 순매수, 거래량, 거래대금, 등락률)가
       예상한 형태로 오는지
"""

import json

from kis_common import get_access_token, RateLimiter, call_kis_api, BASE_URL, APP_KEY, APP_SECRET

# 테스트용 5종목 (업종 다양하게 선정)
TEST_STOCKS = [
    ("005930", "삼성전자"),
    ("000660", "SK하이닉스"),
    ("373220", "LG에너지솔루션"),
    ("035720", "카카오"),
    ("035420", "NAVER"),
]


def find_latest_valid_trend(output_list):
    """
    투자자매매동향 output 배열에서, 공란(당일 미확정)이 아닌
    가장 최근 항목을 찾아서 반환한다.

    설계 문서 6-3에 적힌 함정: 당일 데이터는 장 종료 후에도 바로
    반영되지 않아 frgn_ntby_qty 등이 빈 문자열('')로 올 수 있음.
    → 공란이면 건너뛰고 그 다음(전 거래일) 항목을 사용.
    """
    for entry in output_list:
        if str(entry.get("frgn_ntby_qty", "")).strip() != "":
            return entry
    return None


def build_headers(token, tr_id):
    return {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": tr_id,
        "custtype": "P",
    }


def fetch_investor_trend(token, limiter, stock_code):
    headers = build_headers(token, "FHKST01010900")
    params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock_code}
    url = f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor"
    return call_kis_api("GET", url, headers, params, rate_limiter=limiter)


def fetch_daily_price(token, limiter, stock_code):
    headers = build_headers(token, "FHKST03010100")
    # 최근 며칠만 확인하면 되므로 넉넉히 10일 전부터 오늘까지
    from datetime import datetime, timedelta

    end_date = datetime.now().strftime("%Y%m%d")
    start_date = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": stock_code,
        "FID_INPUT_DATE_1": start_date,
        "FID_INPUT_DATE_2": end_date,
        "FID_PERIOD_DIV_CODE": "D",
        "FID_ORG_ADJ_PRC": "0",
    }
    url = f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
    return call_kis_api("GET", url, headers, params, rate_limiter=limiter)


def main():
    print("=" * 60)
    print("kis_common.py 검증 테스트 — 5종목")
    print("=" * 60)

    token = get_access_token()
    # 초당 10건으로 설정했더니 3번째 호출부터 "초당 거래건수 초과" 오류가
    # 발생함을 실측으로 확인 (2026-08-31 테스트). 재시도 로직이 있어 결과적으로는
    # 성공하지만, 재시도에 의존하지 않도록 처음부터 안전하게 초당 2건으로 하향.
    limiter = RateLimiter(max_calls_per_sec=2)

    success_count = 0
    fail_count = 0

    for stock_code, stock_name in TEST_STOCKS:
        print(f"\n--- {stock_name}({stock_code}) ---")

        trend_data = fetch_investor_trend(token, limiter, stock_code)
        price_data = fetch_daily_price(token, limiter, stock_code)

        if trend_data and trend_data.get("output"):
            latest = find_latest_valid_trend(trend_data["output"])
            if latest is None:
                print("  [투자자매매동향] 최근 데이터가 전부 공란 — 비정상 상황, 확인 필요")
            else:
                trade_date = latest.get("stck_bsop_date", "?")
                frgn_qty = latest.get("frgn_ntby_qty")
                orgn_qty = latest.get("orgn_ntby_qty")
                frgn_amt_million = int(latest.get("frgn_ntby_tr_pbmn"))
                print(f"  [투자자매매동향 | 기준일 {trade_date}] 외국인 순매수 {frgn_qty}주 / 기관 순매수 {orgn_qty}주")
                print(
                    f"                              외국인 {frgn_amt_million:,}백만원 "
                    f"(→ 원 단위 저장 시 ×1,000,000 = {frgn_amt_million * 1_000_000:,}원)"
                )
        else:
            print("  [투자자매매동향] 데이터 없음 또는 실패")

        if price_data and price_data.get("output2"):
            latest = price_data["output2"][0]
            close = latest.get("stck_clpr")
            volume = latest.get("acml_vol")
            amount = latest.get("acml_tr_pbmn")
            print(f"  [일별시세] 종가 {close}원 / 거래량 {volume}주 / 거래대금 {amount}원")
        else:
            print("  [일별시세] 데이터 없음 또는 실패")

        if trend_data and price_data:
            success_count += 1
        else:
            fail_count += 1

    print("\n" + "=" * 60)
    print(f"결과: 성공 {success_count}종목 / 실패 {fail_count}종목")
    print("=" * 60)


if __name__ == "__main__":
    main()