"""
screening/scripts/run_screening_batch.py

screening.run_screening_batch() DB 함수를 호출해서 스크리닝 배치를 실행한다.
run_screening.py와 달리 candidates_found 집계, emerging sectors 조회, run_log 기록 없이
"함수 호출 + 결과 출력"만 하는 최소 실행 스크립트 (GitHub Actions 등에서 단순 트리거용).

DB 함수 자체가 실행 시작 부분에서 해당 trade_date의 기존 screening_results 행을
DELETE 하고 다시 INSERT하므로, 하루에 여러 번 실행해도 같은 trade_date 데이터가
중복되지 않는다 (screening_results는 trade_date+stock_code 기준 delete-then-insert 방식).

실행 방법:
    cd screening
    python scripts/run_screening_batch.py
"""

import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 찾을 수 없습니다. "
            "screening/.env(로컬) 또는 환경변수(GitHub Actions)를 확인하세요."
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def main():
    started_at = datetime.now(timezone.utc)
    print(f"[시작] {started_at.isoformat()}")

    try:
        client = get_supabase_client()
        result = client.schema("screening").rpc("run_screening_batch", {}).execute()

        finished_at = datetime.now(timezone.utc)
        print(f"[완료] {finished_at.isoformat()}")
        print(f"[결과] run_screening_batch() 반환값: {result.data}")

    except Exception as e:
        print(f"[오류] 스크리닝 배치 실행 실패: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
