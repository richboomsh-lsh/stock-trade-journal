"""
stock_master.csv (KOSPI+KOSDAQ 전체 종목) → Supabase screening.stock_master upsert
- 실행 위치: screening/scripts/
- 입력 파일: screening/data/stock_master.csv (download_stock_master.py 결과물)
"""

import os
import sys
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# ── 설정 ──────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(SCRIPT_DIR, "..", ".env")
CSV_PATH = os.path.join(SCRIPT_DIR, "..", "data", "stock_master.csv")
BATCH_SIZE = 500  # 한 번에 upsert할 행 수 (payload 크기 고려)

# 시장구분 값을 CHECK 제약이 요구하는 'KOSPI'/'KOSDAQ'로 정규화
MARKET_MAP = {
    "코스피": "KOSPI", "KOSPI": "KOSPI", "kospi": "KOSPI",
    "코스닥": "KOSDAQ", "KOSDAQ": "KOSDAQ", "kosdaq": "KOSDAQ",
}

def normalize_market(value: str) -> str:
    normalized = MARKET_MAP.get(str(value).strip())
    if normalized is None:
        raise ValueError(f"알 수 없는 시장구분 값: {value!r} (KOSPI/KOSDAQ/코스피/코스닥만 허용)")
    return normalized


def main():
    load_dotenv(ENV_PATH)
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)

    if not os.path.exists(CSV_PATH):
        print(f"❌ CSV 파일을 찾을 수 없습니다: {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH, dtype=str)  # 종목코드 앞자리 0 보존 위해 전부 문자열로 읽기
    print(f"📄 CSV 로드: {len(df)}행")

    # CSV 컬럼명이 스크립트 기존 결과물(종목코드/종목명/시장구분) 기준이라고 가정
    # 컬럼명이 다르면 아래 세 줄만 맞게 수정하면 됩니다
    df = df.rename(columns={
        "종목코드": "stock_code",
        "종목명": "stock_name",
        "시장구분": "market",
    })

    missing_cols = {"stock_code", "stock_name", "market"} - set(df.columns)
    if missing_cols:
        print(f"❌ CSV에 필요한 컬럼이 없습니다: {missing_cols} (실제 컬럼: {list(df.columns)})")
        sys.exit(1)

    df["market"] = df["market"].apply(normalize_market)
    df["stock_code"] = df["stock_code"].str.strip()
    df["stock_name"] = df["stock_name"].str.strip()

    records = df[["stock_code", "stock_name", "market"]].to_dict(orient="records")

    total = len(records)
    success = 0
    for i in range(0, total, BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            (
                client.schema("screening")
                .table("stock_master")
                .upsert(batch, on_conflict="stock_code")
                .execute()
            )
            success += len(batch)
            print(f"  ✅ {i + len(batch)}/{total} 처리 완료")
        except Exception as e:
            print(f"  ❌ 배치 {i}~{i + len(batch)} 실패: {e}")

    print(f"\n총 {total}건 중 {success}건 upsert 성공")


if __name__ == "__main__":
    main()