"""
screening/scripts/collect_daily_market_data.py

screening.stock_master에 있는 전체 종목(코스피+코스닥, 2,720개)을 순회하며
투자자매매동향(외국인/기관 순매수) + 일별시세(종가/거래량/거래대금/등락률)를
수집해서 screening.daily_market_data에 저장한다.
끝나면 screening.run_log에 실행 결과를 기록한다.

실행 방법:
    cd screening
    python scripts/collect_daily_market_data.py --limit 5      ← 먼저 5종목으로 검증
    python scripts/collect_daily_market_data.py                ← 검증되면 전체 실행 (약 45분 소요 예상)

소요 시간 계산: 종목당 API 2건 호출, 초당 2건 제한 → 2,720종목 × 2건 ÷ 2건/초
             ≈ 2,720초 ≈ 45분
"""

import os
import time
import argparse
import traceback
from datetime import datetime, timedelta, timezone

from supabase import create_client
from dotenv import load_dotenv

from kis_common import (
    get_access_token,
    RateLimiter,
    call_kis_api,
    BASE_URL,
    APP_KEY,
    APP_SECRET,
    logger,
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "screening/.env 파일에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없습니다."
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def fetch_stock_list(client):
    """
    screening.stock_master에서 전체 종목코드 목록을 가져온다.

    ⚠️ Supabase REST API는 한 번의 요청당 기본적으로 최대 1,000건까지만
    반환한다 (프로젝트의 "Max Rows" 설정, 초과분은 에러 없이 조용히 잘림).
    2,720종목을 한 번에 요청하면 앞쪽 1,000건만 오게 되므로,
    .range()로 1,000건씩 나눠 요청해서 전체를 모아온다.
    (2026-08-31 실측: 페이지네이션 없이 실행했더니 1,000종목만 처리되는 것을 확인)
    """
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            client.schema("screening")
            .table("stock_master")
            .select("stock_code, stock_name")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data
        all_rows.extend(rows)
        logger.info(f"stock_master 조회: {len(rows)}건 수신 (누적 {len(all_rows)}건)")
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def build_headers(token, tr_id):
    return {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": tr_id,
        "custtype": "P",
    }


def find_latest_valid_trend(output_list):
    """당일 미확정(공란)인 항목은 건너뛰고, 값이 채워진 가장 최근 항목을 찾는다."""
    for entry in output_list:
        if str(entry.get("frgn_ntby_qty", "")).strip() != "":
            return entry
    return None


def find_price_entry_by_date(output_list, trade_date):
    """일별시세 목록에서 투자자매매동향과 동일한 기준일(trade_date)의 항목을 찾는다."""
    for entry in output_list:
        if entry.get("stck_bsop_date") == trade_date:
            return entry
    return None


def calc_change_rate(price_entry):
    """
    등락률(%) = 전일대비(prdy_vrss) ÷ 전일종가 × 100
    전일종가 = 당일종가(stck_clpr) − 전일대비(prdy_vrss)
    (prdy_vrss는 이미 부호 포함 — 실측으로 검증됨, 2026-08-31)
    """
    try:
        close = int(price_entry["stck_clpr"])
        prdy_vrss = int(price_entry["prdy_vrss"])
        prev_close = close - prdy_vrss
        if prev_close == 0:
            return None
        return round(prdy_vrss / prev_close * 100, 2)
    except (KeyError, ValueError, ZeroDivisionError):
        return None


def collect_one_stock(token, limiter, stock_code):
    """
    한 종목의 투자자매매동향 + 일별시세를 조회해서 daily_market_data
    저장용 dict 1개로 합쳐 반환한다. 실패/데이터 없음이면 None.
    """
    # 1) 투자자매매동향 — 여기서 기준일(trade_date)을 먼저 확정
    trend_headers = build_headers(token, "FHKST01010900")
    trend_params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock_code}
    trend_data = call_kis_api(
        "GET",
        f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor",
        trend_headers,
        trend_params,
        rate_limiter=limiter,
    )
    if not trend_data or not trend_data.get("output"):
        logger.warning(f"{stock_code}: 투자자매매동향 조회 실패/데이터 없음 — 건너뜀")
        return None

    trend_entry = find_latest_valid_trend(trend_data["output"])
    if trend_entry is None:
        logger.warning(f"{stock_code}: 투자자매매동향 전부 공란 — 건너뜀")
        return None

    trade_date = trend_entry.get("stck_bsop_date")
    if not trade_date:
        logger.warning(f"{stock_code}: 기준일(stck_bsop_date) 없음 — 건너뜀")
        return None

    # 2) 일별시세 — 같은 기준일(trade_date)의 데이터를 찾음
    price_headers = build_headers(token, "FHKST03010100")
    end_date = datetime.now().strftime("%Y%m%d")
    # trade_date 이전 5일부터 조회해서, 휴장일 등으로 살짝 밀려도 trade_date가 범위 안에 들어오게 함
    start_date = (datetime.strptime(trade_date, "%Y%m%d") - timedelta(days=5)).strftime("%Y%m%d")

    price_params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": stock_code,
        "FID_INPUT_DATE_1": start_date,
        "FID_INPUT_DATE_2": end_date,
        "FID_PERIOD_DIV_CODE": "D",
        "FID_ORG_ADJ_PRC": "0",
    }
    price_data = call_kis_api(
        "GET",
        f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
        price_headers,
        price_params,
        rate_limiter=limiter,
    )
    if not price_data or not price_data.get("output2"):
        logger.warning(f"{stock_code}: 일별시세 조회 실패/데이터 없음 — 건너뜀")
        return None

    price_entry = find_price_entry_by_date(price_data["output2"], trade_date)
    if price_entry is None:
        logger.warning(f"{stock_code}: 일별시세에서 {trade_date} 데이터 못 찾음 — 건너뜀")
        return None

    # 3) 필드 파싱 + 단위 변환 (백만원 → 원)
    try:
        foreign_net_buy = int(trend_entry["frgn_ntby_tr_pbmn"]) * 1_000_000
        inst_net_buy = int(trend_entry["orgn_ntby_tr_pbmn"]) * 1_000_000
        close_price = int(price_entry["stck_clpr"])
        volume = int(price_entry["acml_vol"])
        trading_value = int(price_entry["acml_tr_pbmn"])
        change_rate = calc_change_rate(price_entry)
    except (KeyError, ValueError) as e:
        logger.warning(f"{stock_code}: 필드 파싱 실패 ({e}) — 건너뜀")
        return None

    trade_date_fmt = f"{trade_date[0:4]}-{trade_date[4:6]}-{trade_date[6:8]}"  # DB용 YYYY-MM-DD

    return {
        "trade_date": trade_date_fmt,
        "stock_code": stock_code,
        "foreign_net_buy": foreign_net_buy,
        "inst_net_buy": inst_net_buy,
        "close_price": close_price,
        "change_rate": change_rate,
        "volume": volume,
        "trading_value": trading_value,
    }


def save_rows(client, rows, max_retries=3):
    """
    수집된 행들을 daily_market_data에 upsert (같은 trade_date+stock_code면 덮어씀)
    Supabase/Cloudflare 쪽 일시적 타임아웃(522 등)에 대비해 재시도 로직 포함.
    (2026-09-03: 저장 도중 522 Connection timed out 발생 → 재시도 없이 전체 스크립트
     중단되고 run_log 기록도 안 남은 사례 있음 — SCREENING-PATCH 009)
    """
    if not rows:
        return
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            (
                client.schema("screening")
                .table("daily_market_data")
                .upsert(rows, on_conflict="trade_date,stock_code")
                .execute()
            )
            return  # 성공하면 바로 종료
        except Exception as e:
            last_error = e
            wait_sec = 5 * (2 ** (attempt - 1))  # 5초 → 10초 → 20초
            logger.warning(
                f"저장 실패 (시도 {attempt}/{max_retries}): {e} — {wait_sec}초 후 재시도"
            )
            if attempt < max_retries:
                time.sleep(wait_sec)
    # 재시도까지 다 실패하면 예외를 다시 던져서 main()의 try/except가 잡게 함
    raise last_error


def write_run_log(client, run_date, status, stocks_processed, error_message, started_at, finished_at):
    (
        client.schema("screening")
        .table("run_log")
        .insert(
            {
                "run_date": run_date,
                "status": status,
                "stocks_processed": stocks_processed,
                "candidates_found": None,  # 스크리닝 조건식은 다음 단계에서 채움
                "error_message": error_message,
                "started_at": started_at,
                "finished_at": finished_at,
            }
        )
        .execute()
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="테스트용: 앞에서 N종목만 처리")
    parser.add_argument("--batch-size", type=int, default=50, help="몇 종목씩 묶어서 저장할지")
    args = parser.parse_args()

    started_at = datetime.now(timezone.utc).isoformat()
    run_date = datetime.now().strftime("%Y-%m-%d")

    client = get_supabase_client()

    # 여기서부터 어떤 예외가 나든 반드시 run_log에 기록을 남긴다.
    # (2026-09-03: 저장 중 예외 발생 시 run_log 기록 없이 스크립트가 죽어버린 사례 있음
    #  — SCREENING-PATCH 009)
    success_count = 0
    fail_count = 0
    try:
        stocks = fetch_stock_list(client)
        if args.limit:
            stocks = stocks[: args.limit]

        logger.info(f"총 {len(stocks)}종목 수집 시작")

        token = get_access_token()
        limiter = RateLimiter(max_calls_per_sec=2)

        buffer = []

        for i, stock in enumerate(stocks, 1):
            stock_code = stock["stock_code"]
            row = collect_one_stock(token, limiter, stock_code)
            if row:
                buffer.append(row)
                success_count += 1
            else:
                fail_count += 1

            if len(buffer) >= args.batch_size:
                save_rows(client, buffer)
                logger.info(f"[{i}/{len(stocks)}] 저장 완료 (누적 성공 {success_count} / 실패 {fail_count})")
                buffer = []

        if buffer:
            save_rows(client, buffer)

        finished_at = datetime.now(timezone.utc).isoformat()
        # 일부 종목만 실패한 건 정상 범위(신규상장/거래정지 등)로 보고 success 처리.
        # 단 하나도 성공하지 못했을 때만 fail로 기록.
        status = "success" if success_count > 0 else "fail"
        error_message = None if fail_count == 0 else f"{fail_count}종목 수집 실패 (콘솔 로그 참고)"

        write_run_log(
            client,
            run_date=run_date,
            status=status,
            stocks_processed=success_count,
            error_message=error_message,
            started_at=started_at,
            finished_at=finished_at,
        )

        logger.info(f"전체 완료: 성공 {success_count} / 실패 {fail_count}")
        logger.info(f"run_log 기록 완료 (status={status})")

    except Exception as e:
        # 재시도까지 다 실패했거나 예상 못한 예외 발생 → 반드시 fail로 기록 후 재발생
        finished_at = datetime.now(timezone.utc).isoformat()
        error_detail = f"{type(e).__name__}: {e}"
        logger.error(f"실행 중 예외 발생, run_log에 fail로 기록합니다: {error_detail}")
        logger.error(traceback.format_exc())
        try:
            write_run_log(
                client,
                run_date=run_date,
                status="fail",
                stocks_processed=success_count,
                error_message=error_detail[:500],  # 컬럼 길이 안전을 위해 자름
                started_at=started_at,
                finished_at=finished_at,
            )
        except Exception as log_error:
            # run_log 기록 자체가 실패하는 최악의 경우에도 최소한 콘솔엔 남긴다.
            logger.error(f"run_log 기록마저 실패: {log_error}")
        raise  # GitHub Actions가 이 실행을 실패(빨간 X)로 표시하도록 예외를 다시 던짐


if __name__ == "__main__":
    main()