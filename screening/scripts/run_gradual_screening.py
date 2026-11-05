"""
screening/scripts/run_gradual_screening.py

screening.run_gradual_screening() DB 함수를 호출해서 점진 스크리닝을 실행한다.
run_screening_batch.py와 같은 패턴의 최소 실행 스크립트 ("함수 호출 + 결과 출력"만 함).

인자 없이 호출하면 DB 함수가 최신 거래일 기준으로 동작한다 (파라미터 DEFAULT NULL).
Supabase만 사용하므로 KIS 토큰은 발급되지 않는다.

DB 함수는 delete-then-insert 방식이라, 같은 날 여러 번 실행해도 결과가 중복되지 않는다.

실행 방법:
    cd screening
    python scripts/run_gradual_screening.py
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
        result = client.schema("screening").rpc("run_gradual_screening", {}).execute()

        finished_at = datetime.now(timezone.utc)
        print(f"[완료] {finished_at.isoformat()}")
        print(f"[결과] run_gradual_screening() 반환값: {result.data}")

    except Exception as e:
        print(f"[오류] 점진 스크리닝 실행 실패: {type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
