"""
코스피 + 코스닥 전체 종목 리스트 확보 스크립트
- KRX가 배포하는 종목마스터 파일(kospi_code.mst, kosdaq_code.mst)을 다운로드해서
  종목코드 / 종목명 / 시장구분 + 위험종목 플래그 5개를 뽑아 CSV로 저장한다.
- 참고: 한국투자증권 공식 GitHub 샘플코드(kis_kospi_code_mst.py / kis_kosdaq_code_mst.py)의
  파싱 규칙을 그대로 사용 (고정폭 텍스트 포맷이라 임의로 바꾸면 안 됨)
"""

import os
import ssl
import urllib.request
import zipfile

import pandas as pd

# 이 스크립트가 있는 screening/scripts 폴더 기준으로 data 폴더를 만든다
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

MASTER_URLS = {
    "KOSPI": "https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip",
    "KOSDAQ": "https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip",
}

# 뒷부분(고정폭 데이터) 길이가 코스피/코스닥이 다르다.
# 공식 샘플의 228/222는 줄 끝 줄바꿈('\n') 1글자를 포함한 값이므로,
# 여기서는 line.rstrip("\r\n")으로 줄바꿈을 먼저 떼고 1씩 뺀 길이를 쓴다.
# (파일 마지막 줄에 줄바꿈이 없어도 안전 / verify_risk_flags.py와 동일한 기준)
TAIL_WIDTH = {
    "KOSPI": 227,
    "KOSDAQ": 221,
}

# 뒷부분(tail) 기준 [시작, 끝) 위치. 값은 'Y' 또는 'N'.
# verify_risk_flags.py로 실측 + 키움 HTS 대조 완료 (2026-10)
# KOSPI 마스터에는 '투자주의환기종목' 칸이 아예 없다 (코스닥 전용 제도) → 항상 'N' 처리
FLAG_OFFSETS = {
    "KOSPI": {
        "거래정지": (60, 61),
        "정리매매": (61, 62),
        "관리종목": (62, 63),
        "불성실공시": (66, 67),
    },
    "KOSDAQ": {
        "투자주의환기": (30, 31),
        "거래정지": (55, 56),
        "정리매매": (56, 57),
        "관리종목": (57, 58),
        "불성실공시": (61, 62),
    },
}

# CSV에 저장할 플래그 컬럼 순서 (upsert_stock_master.py가 이 이름을 그대로 읽는다)
FLAG_NAMES = ["관리종목", "투자주의환기", "정리매매", "불성실공시", "거래정지"]


def download_and_extract(market: str) -> str:
    """마스터 zip을 받아서 압축을 풀고 .mst 파일 경로를 반환한다."""
    ssl._create_default_https_context = ssl._create_unverified_context  # KRX 서버 인증서 이슈 우회 (공식 샘플과 동일)

    url = MASTER_URLS[market]
    zip_path = os.path.join(DATA_DIR, f"{market.lower()}_code.zip")
    mst_filename = f"{market.lower()}_code.mst"
    mst_path = os.path.join(DATA_DIR, mst_filename)

    print(f"[{market}] 다운로드 중... {url}")
    urllib.request.urlretrieve(url, zip_path)

    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(DATA_DIR)

    os.remove(zip_path)
    print(f"[{market}] 다운로드 및 압축 해제 완료 → {mst_path}")
    return mst_path


def parse_master_file(mst_path: str, market: str) -> pd.DataFrame:
    """
    .mst 파일은 한 줄에 앞부분(가변폭 텍스트: 단축코드/표준코드/한글명) +
    뒷부분(고정폭 숫자/코드 데이터)이 붙어있는 특이한 포맷이다.

    뒷부분의 맨 앞 2글자는 '증권그룹구분코드'로, 종목의 유형을 나타낸다.
    (ST=주권, EF=ETF, EN=ETN, EW=ELW, RT=리츠, MF/SC/IF=투자회사, BC=수익증권 등)
    우리는 일반 주식(우선주 포함)인 'ST'만 필요하므로 여기서 같이 뽑아둔다.

    뒷부분에는 관리종목 / 투자주의환기 / 정리매매 / 불성실공시 / 거래정지 같은
    '위험 지정' 여부도 Y/N 한 글자로 들어있어서 함께 파싱한다.
    (이 플래그가 하나라도 Y인 종목은 나중에 일별 데이터 수집에서 제외된다)
    """
    tail_width = TAIL_WIDTH[market]
    offsets = FLAG_OFFSETS[market]
    rows = []

    with open(mst_path, mode="r", encoding="cp949") as f:
        for line in f:
            line = line.rstrip("\r\n")          # 줄바꿈 먼저 제거 (길이 계산을 안전하게)
            head = line[:-tail_width]
            tail = line[-tail_width:]

            short_code = head[0:9].rstrip()      # 단축코드 (종목코드, 6자리)
            # standard_code = head[9:21].rstrip()  # 표준코드 (ISIN) - 이번 단계에서는 불필요
            name = head[21:].strip()             # 한글 종목명
            group_code = tail[0:2].strip()       # 증권그룹구분코드 (ST=주권)

            row = {
                "종목코드": short_code,
                "종목명": name,
                "증권그룹구분코드": group_code,
            }
            for flag in FLAG_NAMES:
                if flag in offsets:
                    start, end = offsets[flag]
                    value = tail[start:end].strip()
                    row[flag] = "Y" if value == "Y" else "N"
                else:
                    row[flag] = "N"   # 해당 시장에 그 칸이 없는 경우 (KOSPI의 투자주의환기)
            rows.append(row)

    df = pd.DataFrame(rows, columns=["종목코드", "종목명", "증권그룹구분코드"] + FLAG_NAMES)
    df["시장구분"] = market
    return df


def print_flag_summary(stocks: pd.DataFrame) -> None:
    """위험종목 플래그 집계를 출력한다 (검증값과 비교하기 위한 용도)."""
    print("\n=== 위험종목 플래그 집계 ===")
    for flag in FLAG_NAMES:
        count = (stocks[flag] == "Y").sum()
        by_market = (
            stocks[stocks[flag] == "Y"]["시장구분"].value_counts().to_dict()
        )
        print(f"  {flag}: {count}개 {by_market if count else ''}")

    is_risky = (stocks[FLAG_NAMES] == "Y").any(axis=1)
    risky_count = int(is_risky.sum())
    print(f"\n  → 하나 이상 해당(중복 제거): {risky_count}개 / 전체 {len(stocks)}개")
    print(f"  → 수집 대상(플래그 전부 N): {len(stocks) - risky_count}개")
    print("  (2026-10 실측 검증값: 전체 2,719개 중 238개 해당 → 수집 대상 2,481개)")


def main():
    all_dfs = []
    for market in ["KOSPI", "KOSDAQ"]:
        mst_path = download_and_extract(market)
        df = parse_master_file(mst_path, market)
        print(f"[{market}] 파싱 완료: {len(df)}개 종목")
        all_dfs.append(df)

    result = pd.concat(all_dfs, ignore_index=True)

    # 증권그룹구분코드가 'ST'(주권)인 것만 남긴다 = 일반 주식 + 우선주
    # (ETF/ETN/ELW/리츠/수익증권 등은 여기서 제외됨. 6자리 숫자 코드만으로는
    #  ETF 등도 걸러지지 않아서 부정확했음 - 예: 069500 KODEX200)
    is_regular_stock = result["증권그룹구분코드"] == "ST"

    stocks = result[is_regular_stock].drop(columns=["증권그룹구분코드"]).copy()
    excluded = result[~is_regular_stock].copy()

    # CSV 컬럼 순서 고정 (upsert_stock_master.py가 이 이름들을 읽는다)
    stocks = stocks[["종목코드", "종목명", "시장구분"] + FLAG_NAMES]

    out_path = os.path.join(DATA_DIR, "stock_master.csv")
    stocks.to_csv(out_path, index=False, encoding="utf-8-sig")

    excluded_path = os.path.join(DATA_DIR, "stock_master_excluded.csv")
    excluded.to_csv(excluded_path, index=False, encoding="utf-8-sig")

    print("\n=== 결과 요약 (일반 주식만) ===")
    print(stocks["시장구분"].value_counts())
    print(f"\n총 {len(stocks)}개 종목 저장 완료 → {out_path}")
    print(f"제외된 {len(excluded)}개 항목(ETF/ETN/ELW/수익증권 등) → {excluded_path}")

    print_flag_summary(stocks)

    print("\n샘플 (앞 5개):")
    print(stocks.head())

    # 삼성전자가 잘 들어있는지 확인 (파싱 위치가 밀리지 않았는지 간단 점검)
    samsung = stocks[stocks["종목코드"] == "005930"]
    print("\n삼성전자 확인:")
    print(samsung if not samsung.empty else "⚠️ 005930 삼성전자를 찾을 수 없습니다!")


if __name__ == "__main__":
    main()
