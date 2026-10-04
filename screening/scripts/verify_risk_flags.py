"""
[진단용] 종목마스터 파일의 '위험 종목' 플래그 위치(오프셋) 검증 스크립트
- 목적: 관리종목 / 환기종목(코스닥) / 정리매매 / 불성실공시 / 거래정지 필드를
  올바른 위치에서 읽고 있는지 실제 파일로 확인한다.
- DB에는 아무것도 쓰지 않는다. (읽기 + CSV 저장만)
- 오프셋 기준: 한국투자증권 공식 샘플코드(kis_kospi_code_mst.py / kis_kosdaq_code_mst.py)의
  field_specs를 누적 합산해서 계산한 값
"""

import os

import pandas as pd

# 기존 스크립트의 다운로드 함수를 그대로 재사용 (같은 폴더에 있어야 함)
from download_stock_master import DATA_DIR, download_and_extract

# 뒷부분 고정폭 데이터 길이 (줄바꿈 문자 제외)
# 기존 스크립트의 228/222는 줄 끝 줄바꿈('\n') 1글자를 포함한 값이라,
# 여기서는 줄바꿈을 먼저 떼어내고 1씩 뺀 길이를 쓴다. (파일 마지막 줄에 줄바꿈이 없어도 안전)
TAIL_WIDTH = {"KOSPI": 227, "KOSDAQ": 221}

# 뒷부분(tail) 기준 [시작, 끝) 위치
FIELDS = {
    "KOSPI": {
        "그룹코드": (0, 2),
        "거래정지": (60, 61),
        "정리매매": (61, 62),
        "관리종목": (62, 63),
        "불성실공시": (66, 67),
        "시가총액_억": (212, 221),  # 정렬 확인용 (뒷부분 끝쪽 필드)
    },
    "KOSDAQ": {
        "그룹코드": (0, 2),
        "환기종목": (30, 31),
        "거래정지": (55, 56),
        "정리매매": (56, 57),
        "관리종목": (57, 58),
        "불성실공시": (61, 62),
        "시가총액_억": (206, 215),
    },
}

FLAG_NAMES = ["관리종목", "환기종목", "정리매매", "불성실공시", "거래정지"]

# 정렬이 맞는지 확인할 기준 종목 (시가총액이 '억 단위로 그럴듯한 큰 숫자'로 나와야 정상)
ANCHORS = {"005930": "삼성전자(KOSPI)", "000660": "SK하이닉스(KOSPI)", "247540": "에코프로비엠(KOSDAQ)"}


def parse(mst_path: str, market: str) -> pd.DataFrame:
    width = TAIL_WIDTH[market]
    rows = []
    with open(mst_path, mode="r", encoding="cp949") as f:
        for line in f:
            line = line.rstrip("\r\n")
            head, tail = line[:-width], line[-width:]
            row = {"종목코드": head[0:9].rstrip(), "종목명": head[21:].strip(), "시장구분": market}
            for name, (s, e) in FIELDS[market].items():
                row[name] = tail[s:e].strip()
            rows.append(row)
    return pd.DataFrame(rows)


def main():
    frames = [parse(download_and_extract(m), m) for m in ["KOSPI", "KOSDAQ"]]
    df = pd.concat(frames, ignore_index=True)
    df = df[df["그룹코드"] == "ST"].copy()  # 기존과 동일하게 일반 주식만

    print("\n=== 1) 일반 주식(ST) 종목 수 — 기존 약 2,720개와 비슷해야 정상 ===")
    print(df["시장구분"].value_counts().to_string())

    print("\n=== 2) 플래그별 값 분포 — 'Y'/'N'만 나와야 정상 (숫자·이상한 문자가 섞이면 위치가 틀린 것) ===")
    for market in ["KOSPI", "KOSDAQ"]:
        sub = df[df["시장구분"] == market]
        for flag in FLAG_NAMES:
            if flag not in sub.columns or sub[flag].isna().all():
                continue
            counts = sub[flag].replace("", "(빈칸)").value_counts().to_dict()
            print(f"  [{market}] {flag}: {counts}")

    print("\n=== 3) 기준 종목 정렬 확인 — 시가총액(억)이 숫자로, 플래그는 모두 N이어야 정상 ===")
    cols = ["종목코드", "종목명", "시장구분", "시가총액_억"] + [f for f in FLAG_NAMES if f in df.columns]
    print(df[df["종목코드"].isin(ANCHORS)][cols].to_string(index=False))

    # 하나라도 Y인 종목 = 제외 대상
    flag_cols = [f for f in FLAG_NAMES if f in df.columns]
    is_risky = (df[flag_cols] == "Y").any(axis=1)
    risky = df[is_risky]

    print("\n=== 4) 제외 대상 집계 ===")
    for flag in flag_cols:
        print(f"  {flag}: {(df[flag] == 'Y').sum()}개")
    print(f"  → 하나 이상 해당(중복 제거): {len(risky)}개 / 전체 {len(df)}개")
    print(f"  → 제외 후 수집 대상: {len(df) - len(risky)}개")

    out_path = os.path.join(DATA_DIR, "risk_flag_check.csv")
    risky[cols].to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"\n제외 대상 목록 저장 → {out_path}")
    print("(이 파일의 종목 몇 개를 키움 HTS에서 실제 관리종목/환기종목 등으로 표시되는지 대조해 주세요)")


if __name__ == "__main__":
    main()
