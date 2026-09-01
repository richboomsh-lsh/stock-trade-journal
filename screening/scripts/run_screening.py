"""
screening/scripts/run_screening.py
SCREENING-PATCH 006 — 스크리닝 조건식 실행 래퍼

DB 함수 screening.run_screening_batch()를 호출해 1~3단계 스크리닝을 수행하고,
결과를 screening.screening_results에 저장한다. 실행 결과는 screening.run_log에 기록.
신규 후보 섹터(2단계 부가 기능)는 get_emerging_sectors()로 조회해 콘솔에만 출력
(자동 반영 없음 — 설계 문서대로 사람이 검토 후 is_fixed_industry를 수동으로 켠다).

실행: python run_screening.py [--date YYYY-MM-DD]
--date 생략 시 daily_market_data에 있는 가장 최근 거래일 기준으로 실행됨.
"""

import argparse
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="스크리닝 기준 거래일 (YYYY-MM-DD). 생략 시 최신 거래일 자동 사용")
    args = parser.parse_args()

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    started_at = datetime.now(timezone.utc)

    try:
        # 1~3단계 스크리닝 실행 (DB 함수 호출, target_date 없으면 함수 내부에서 최신 거래일 사용)
        rpc_params = {"p_target_date": args.date} if args.date else {}
        result = client.schema("screening").rpc("run_screening_batch", rpc_params).execute()
        candidates_found = result.data if isinstance(result.data, int) else 0

        # 참고용 — 전체 종목 수
        stocks_processed = (
            client.schema("screening")
            .table("stock_master")
            .select("stock_code", count="exact")
            .execute()
            .count
        )

        # 신규 후보 섹터 조회 (저장하지 않고 콘솔 출력만)
        emerging_params = {"p_target_date": args.date} if args.date else {}
        emerging = client.schema("screening").rpc("get_emerging_sectors", emerging_params).execute()

        print(f"[스크리닝 완료] 통과 종목 수: {candidates_found}")
        if emerging.data:
            print("\n[신규 후보 섹터 발견 — 고정 리스트 편입 검토 필요]")
            for row in emerging.data:
                net_buy = row.get("latest_net_buy_sum") or 0
                print(f"  - {row['industry']} (최근 순위 {row['latest_rank']}위, 순매수합 {net_buy:,}원)")
        else:
            print("\n신규 후보 섹터 없음 (또는 랭킹 데이터가 3거래일치만큼 아직 안 쌓임)")

        finished_at = datetime.now(timezone.utc)
        client.schema("screening").table("run_log").insert(
            {
                "run_date": started_at.date().isoformat(),
                "status": "success",
                "stocks_processed": stocks_processed,
                "candidates_found": candidates_found,
                "started_at": started_at.isoformat(),
                "finished_at": finished_at.isoformat(),
            }
        ).execute()

    except Exception as e:
        finished_at = datetime.now(timezone.utc)
        client.schema("screening").table("run_log").insert(
            {
                "run_date": started_at.date().isoformat(),
                "status": "fail",
                "error_message": str(e),
                "started_at": started_at.isoformat(),
                "finished_at": finished_at.isoformat(),
            }
        ).execute()
        raise


if __name__ == "__main__":
    main()