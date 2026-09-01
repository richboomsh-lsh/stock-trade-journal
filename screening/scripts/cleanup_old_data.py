"""
30거래일 초과 데이터 정리 스크립트

screening.daily_market_data / screening.daily_industry_ranking 테이블에서
가장 최근 30개 거래일만 남기고 그보다 오래된 데이터를 삭제합니다.
실제 삭제 로직은 DB 함수(cleanup_old_screening_data)가 처리하며,
이 스크립트는 그 함수를 호출하고 결과를 출력하는 역할만 합니다.
"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def main():
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    print("30거래일 초과 데이터 정리를 시작합니다...")

    result = (
        client.schema("screening")
        .rpc("cleanup_old_screening_data", {"keep_days": 30})
        .execute()
    )

    row = result.data[0]
    print(f"daily_market_data: {row['deleted_market_data']}건 삭제")
    print(f"daily_industry_ranking: {row['deleted_industry_ranking']}건 삭제")
    print("정리 완료.")


if __name__ == "__main__":
    main()