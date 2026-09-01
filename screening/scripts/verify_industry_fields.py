"""
지수업종 / KRX 테마 플래그 파싱 오프셋 검증용 스크립트

목적:
- download_stock_master.py가 이미 받아둔 kospi_code.mst / kosdaq_code.mst 파일을
  재다운로드 없이 그대로 재사용해서, 몇 개의 잘 알려진 종목에 대해
  '지수업종대/중/소분류'와 'KRX 테마 플래그(반도체/바이오/자동차 등)' 값을 직접 출력한다.
- 한국투자증권 공식 샘플코드(kis_kospi_code_mst.py)의 field_specs를 기준으로 계산한
  오프셋이며, KOSPI는 검증됨. KOSDAQ은 part2 길이가 6바이트 짧아(228 vs 222)
  동일 오프셋인지 아직 미검증 상태 - 이 스크립트로 확인하는 것이 목적.

사용법:
  screening/scripts/ 폴더에 저장 후 실행
  (screening/data/kospi_code.mst, kosdaq_code.mst 가 이미 있어야 함.
   없다면 download_stock_master.py를 먼저 한 번 실행)
"""

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")

PART2_WIDTH = {"KOSPI": 228, "KOSDAQ": 222}

# (시작offset, 끝offset, 필드명) - tail(뒷부분 고정폭 데이터) 기준
# 공식 field_specs: [2,1,4,4,4, 1,1,1,1,1, 1,1,1,1,1, 1,1,1,1,1, 1,1,1,1,1, 1,1,1,1,1, ...]
FIELDS = [
    (0, 2, "그룹코드"),
    (2, 3, "시가총액규모"),
    (3, 7, "지수업종대분류"),
    (7, 11, "지수업종중분류"),
    (11, 15, "지수업종소분류"),
    (15, 16, "제조업"),
    (25, 26, "KRX자동차"),
    (26, 27, "KRX반도체"),
    (27, 28, "KRX바이오"),
    (28, 29, "KRX은행"),
    (30, 31, "KRX에너지화학"),
    (31, 32, "KRX철강"),
    (33, 34, "KRX미디어통신"),
    (34, 35, "KRX건설"),
    (36, 37, "KRX증권"),
    (37, 38, "KRX선박"),
    (38, 39, "KRX섹터_보험"),
    (39, 40, "KRX섹터_운송"),
]

# 눈으로 결과를 판단하기 쉬운, 업종이 명확한 샘플 종목들
SAMPLE_CODES = {
    "KOSPI": {
        "005930": "삼성전자 (반도체 Y 예상)",
        "000660": "SK하이닉스 (반도체 Y 예상)",
        "005380": "현대차 (자동차 Y 예상)",
        "105560": "KB금융 (은행 Y 예상)",
    },
    "KOSDAQ": {
        "247540": "에코프로비엠 (2차전지 - 이 12개 목록엔 없음, 전부 공백 예상)",
        "091990": "셀트리온제약 (바이오 Y 여부 확인)",
        "196170": "알테오젠 (바이오 Y 여부 확인)",
    },
}


def parse_one_market(market):
    mst_path = os.path.join(DATA_DIR, f"{market.lower()}_code.mst")
    if not os.path.exists(mst_path):
        print(f"[{market}] {mst_path} 가 없습니다. download_stock_master.py를 먼저 실행해주세요.")
        return

    part2_width = PART2_WIDTH[market]
    print(f"\n{'='*70}\n[{market}] 샘플 종목 필드 확인 (part2_width={part2_width})\n{'='*70}")

    found = set()
    with open(mst_path, mode="r", encoding="cp949") as f:
        for line in f:
            head = line[0 : len(line) - part2_width]
            tail = line[-part2_width:]
            short_code = head[0:9].rstrip()

            if short_code in SAMPLE_CODES[market]:
                found.add(short_code)
                name = head[21:].strip()
                label = SAMPLE_CODES[market][short_code]
                print(f"\n{name} ({short_code}) - {label}")
                for start, end, field_label in FIELDS:
                    print(f"  {field_label:12s}: '{tail[start:end]}'")

    missing = set(SAMPLE_CODES[market]) - found
    if missing:
        print(f"\n⚠️ 마스터파일에서 못 찾은 코드: {missing}")

    # 전체 종목 대상 KRX 플래그별 Y 개수 (대략적인 감 잡기용 - 너무 0개거나 너무 전체면 오프셋이 틀린 것)
    print(f"\n[{market}] 전체 종목 대상 KRX 플래그별 'Y' 개수 (참고용)")
    krx_fields = [(s, e, l) for s, e, l in FIELDS if l.startswith("KRX")]
    counts = {label: 0 for _, _, label in krx_fields}
    total = 0
    with open(mst_path, mode="r", encoding="cp949") as f:
        for line in f:
            tail = line[-part2_width:]
            total += 1
            for start, end, label in krx_fields:
                if tail[start:end].strip().upper() == "Y":
                    counts[label] += 1
    print(f"  (전체 {total}개 종목 기준)")
    for label, cnt in counts.items():
        print(f"  {label:12s}: {cnt}개")


if __name__ == "__main__":
    parse_one_market("KOSPI")
    parse_one_market("KOSDAQ")
