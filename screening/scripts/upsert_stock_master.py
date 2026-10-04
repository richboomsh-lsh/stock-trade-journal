"""
stock_master.csv (KOSPI+KOSDAQ 전체 종목) → Supabase screening.stock_master upsert
- 실행 위치: screening/scripts/
- 입력 파일: screening/data/stock_master.csv (download_stock_master.py 결과물)
- 종목코드/종목명/시장구분 외에, 위험종목 플래그 5개와 갱신 시각도 함께 올린다.
  (관리종목 / 투자주의환기 / 정리매매 / 불성실공시 / 거래정지)
  → 이 플래그가 하나라도 true인 종목은 collect_daily_market_data.py에서 수집 제외됨
"""

import os
import sys
from datetime import datetime, timezone

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

# CSV의 한글 플래그 컬럼명 → DB 컬럼명
# (CSV 쪽 이름은 download_stock_master.py의 FLAG_NAMES와 반드시 일치해야 함)
FLAG_COLUMN_MAP = {
    "관리종목": "is_managed",
    "투자주의환기": "is_caution_warning",
    "정리매매": "is_liquidation",
    "불성실공시": "is_unfaithful_disclosure",
    "거래정지": "is_trading_halted",
}

BASE_COLUMNS = ["stock_code", "stock_name", "market"]


def normalize_market(value: str) -> str:
    normalized = MARKET_MAP.get(str(value).strip())
    if normalized is None:
        raise ValueError(f"알 수 없는 시장구분 값: {value!r} (KOSPI/KOSDAQ/코스피/코스닥만 허용)")
    return normalized


def to_bool(value) -> bool:
    """마스터 파일의 'Y'/'N' 문자를 DB boolean으로 변환. 'Y'만 True, 그 외(N/빈칸/NaN)는 False."""
    return str(value).strip().upper() == "Y"


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

    missing_cols = set(BASE_COLUMNS) - set(df.columns)
    if missing_cols:
        print(f"❌ CSV에 필요한 컬럼이 없습니다: {missing_cols} (실제 컬럼: {list(df.columns)})")
        sys.exit(1)

    df["market"] = df["market"].apply(normalize_market)
    df["stock_code"] = df["stock_code"].str.strip()
    df["stock_name"] = df["stock_name"].str.strip()

    # 위험종목 플래그 처리.
    # 옛 버전 CSV(플래그 컬럼 없음)로도 죽지 않게 하기 위한 안전장치:
    # 플래그 컬럼이 하나라도 없으면 플래그 없이 기존처럼 3컬럼만 올린다.
    # (워크플로우에서 마스터 다운로드가 실패해 옛 CSV가 남아있는 경우를 대비)
    missing_flags = [csv_col for csv_col in FLAG_COLUMN_MAP if csv_col not in df.columns]
    has_flags = not missing_flags

    if has_flags:
        for csv_col, db_col in FLAG_COLUMN_MAP.items():
            df[db_col] = df[csv_col].apply(to_bool)
        # 이번 실행 시각을 모든 행에 동일하게 기록 → "오늘 플래그가 갱신됐는지" 확인용
        df["flags_updated_at"] = datetime.now(timezone.utc).isoformat()
        upload_columns = BASE_COLUMNS + list(FLAG_COLUMN_MAP.values()) + ["flags_updated_at"]

        risky = df[list(FLAG_COLUMN_MAP.values())].any(axis=1)
        print("\n=== 위험종목 플래그 집계 (CSV 기준) ===")
        for csv_col, db_col in FLAG_COLUMN_MAP.items():
            print(f"  {csv_col}({db_col}): {int(df[db_col].sum())}개")
        print(f"  → 하나 이상 해당: {int(risky.sum())}개 / 전체 {len(df)}개")
        print(f"  → 수집 대상: {len(df) - int(risky.sum())}개\n")
    else:
        print(
            f"⚠️ CSV에 위험종목 플래그 컬럼이 없습니다: {missing_flags}\n"
            f"   → 플래그 없이 종목코드/종목명/시장구분만 upsert합니다. "
            f"(DB의 기존 플래그 값은 그대로 유지됩니다)\n"
            f"   → download_stock_master.py를 최신 버전으로 먼저 실행하세요."
        )
        upload_columns = BASE_COLUMNS

    records = df[upload_columns].to_dict(orient="records")

    total = len(records)
    success = 0
    failed_batches = 0
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
            failed_batches += 1
            print(f"  ❌ 배치 {i}~{i + len(batch)} 실패: {e}")

    print(f"\n총 {total}건 중 {success}건 upsert 성공")
    if failed_batches:
        # 일부 종목의 플래그가 어제 값으로 남게 되므로, 실패 사실을 명확히 남긴다
        print(f"⚠️ 실패한 배치 {failed_batches}개 — 해당 종목의 플래그는 이전 값이 유지됩니다")
        sys.exit(1)


if __name__ == "__main__":
    main()
