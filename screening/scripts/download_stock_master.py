"""
코스피 + 코스닥 전체 종목 리스트 확보 스크립트
- KRX가 배포하는 종목마스터 파일(kospi_code.mst, kosdaq_code.mst)을 다운로드해서
  종목코드 / 종목명 / 시장구분 만 뽑아 CSV로 저장한다.
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

# part2(뒷부분 고정폭 데이터) 길이가 코스피/코스닥이 다르다 (공식 샘플 기준)
PART2_WIDTH = {
    "KOSPI": 228,
    "KOSDAQ": 222,
}


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
    """
    part2_width = PART2_WIDTH[market]
    rows = []

    with open(mst_path, mode="r", encoding="cp949") as f:
        for line in f:
            head = line[0 : len(line) - part2_width]
            tail = line[-part2_width:]

            short_code = head[0:9].rstrip()      # 단축코드 (종목코드, 6자리)
            # standard_code = head[9:21].rstrip()  # 표준코드 (ISIN) - 이번 단계에서는 불필요
            name = head[21:].strip()             # 한글 종목명
            group_code = tail[0:2].strip()       # 증권그룹구분코드 (ST=주권)

            rows.append((short_code, name, group_code))

    df = pd.DataFrame(rows, columns=["종목코드", "종목명", "증권그룹구분코드"])
    df["시장구분"] = market
    return df


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

    out_path = os.path.join(DATA_DIR, "stock_master.csv")
    stocks.to_csv(out_path, index=False, encoding="utf-8-sig")

    excluded_path = os.path.join(DATA_DIR, "stock_master_excluded.csv")
    excluded.to_csv(excluded_path, index=False, encoding="utf-8-sig")

    print("\n=== 결과 요약 (일반 주식만) ===")
    print(stocks["시장구분"].value_counts())
    print(f"\n총 {len(stocks)}개 종목 저장 완료 → {out_path}")
    print(f"제외된 {len(excluded)}개 항목(ETF/ETN/ELW/수익증권 등) → {excluded_path}")

    print("\n샘플 (앞 5개):")
    print(stocks.head())

    # 삼성전자가 잘 들어있는지 확인
    samsung = stocks[stocks["종목코드"] == "005930"]
    print("\n삼성전자 확인:")
    print(samsung if not samsung.empty else "⚠️ 005930 삼성전자를 찾을 수 없습니다!")


if __name__ == "__main__":
    main()