"""
screening/scripts/kis_common.py

KIS Developers API 공통 유틸리티
──────────────────────────────
앞으로 만들 모든 수집 스크립트(investor_trend, daily_price, 전체 종목 순회 등)는
이 모듈의 함수들을 가져다 쓴다. 토큰 발급/Rate Limiter/재시도 로직을 각 스크립트마다
따로 작성하지 않기 위함 (한 곳에서만 관리 → 수정할 때 한 곳만 고치면 됨).

포함된 것:
    1. get_access_token()   — 토큰 발급 (test_kis_auth.py 검증 로직 기반)
    2. RateLimiter           — 초당 10건 제한
    3. call_kis_api()        — 재시도(백오프) 포함 API 호출 래퍼

사용 예시:
    from kis_common import get_access_token, RateLimiter, call_kis_api, BASE_URL, APP_KEY, APP_SECRET

    token = get_access_token()
    limiter = RateLimiter(max_calls_per_sec=10)

    headers = {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {token}",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
        "tr_id": "FHKST01010900",
        "custtype": "P",
    }
    params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": "005930"}

    data = call_kis_api("GET", f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor",
                         headers, params, rate_limiter=limiter)
"""

import os
import json
import time
import logging
from collections import deque

import requests
from dotenv import load_dotenv

# screening/.env 파일 로드
load_dotenv()

APP_KEY = os.getenv("KIS_APP_KEY")
APP_SECRET = os.getenv("KIS_APP_SECRET")

# 실전투자 도메인 (모의투자 테스트 시 openapivts.koreainvestment.com:29443 으로 교체)
BASE_URL = "https://openapi.koreainvestment.com:9443"

# ---- 로깅 설정: print() 대신 사용 — 시각, 레벨(정보/경고/오류)이 자동으로 붙어서
#      나중에 2,720종목 순회할 때 어디서 무슨 일이 있었는지 추적하기 쉬움 ----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kis_common")


# =========================================================
# 1. 토큰 발급
# =========================================================
def get_access_token():
    """
    KIS 접근토큰을 발급받는다. (test_kis_auth.py의 검증된 로직을 그대로 재사용)

    ※ 캐싱(파일에 토큰 저장해뒀다가 재사용)은 일부러 넣지 않았음.
      이 프로젝트는 "하루 1회 배치 스크립트" 용도라, 스크립트 시작할 때 1번만
      호출해서 그 실행이 끝날 때까지(수 분~10여 분) 재사용하면 충분함.
      토큰 유효시간은 통상 24시간이라 배치 1회 실행 중에 만료될 걱정은 없음.
      (매일 정각 자동 실행 시 매번 새로 발급받는 것도 큰 문제 없음 — KIS는
      "발급 후 일정 시간 내 재발급 시 기존 토큰 반환" 방식이라 낭비도 적음)
    """
    if not APP_KEY or not APP_SECRET:
        raise RuntimeError(
            "screening/.env 파일에 KIS_APP_KEY / KIS_APP_SECRET이 없습니다. "
            ".env.example을 참고해서 값을 채워주세요."
        )

    url = f"{BASE_URL}/oauth2/tokenP"
    headers = {"content-type": "application/json"}
    body = {
        "grant_type": "client_credentials",
        "appkey": APP_KEY,
        "appsecret": APP_SECRET,
    }

    logger.info("토큰 발급 요청 중...")
    response = requests.post(url, headers=headers, data=json.dumps(body), timeout=10)

    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        expires = data.get("access_token_token_expired")
        logger.info(f"토큰 발급 성공 (만료 예정: {expires})")
        return token
    else:
        raise RuntimeError(
            f"토큰 발급 실패 (status={response.status_code}): {response.text}"
        )


# =========================================================
# 2. Rate Limiter — 초당 10건 제한
# =========================================================
class RateLimiter:
    """
    "최근 1초 동안 몇 번 호출했는지"를 기억해뒀다가, 한도(기본 10건)를
    넘기려는 순간 자동으로 잠깐 멈춰서(sleep) 한도를 넘지 않게 해주는 도구.

    비유: 놀이기구 앞에서 "1초에 10명만 태울 수 있어요"라고 안내하는
    직원이라고 생각하면 됨 — 11번째 사람이 오면, 가장 먼저 탄 사람이
    타고 1초가 지날 때까지 잠깐 기다리게 하는 것.

    사용법:
        limiter = RateLimiter(max_calls_per_sec=10)
        for stock in stocks:
            limiter.wait_if_needed()   # API 호출 "직전"에 항상 호출
            call_api(...)
    """

    def __init__(self, max_calls_per_sec=10):
        self.max_calls = max_calls_per_sec
        self.call_times = deque()  # 최근 호출 시각들을 순서대로 기록

    def wait_if_needed(self):
        now = time.monotonic()

        # 1초보다 오래된 기록은 더 이상 의미 없으니 버림
        while self.call_times and now - self.call_times[0] >= 1.0:
            self.call_times.popleft()

        # 최근 1초 안에 이미 한도만큼 호출했다면, 가장 오래된 호출이
        # 1초를 채울 때까지 대기
        if len(self.call_times) >= self.max_calls:
            sleep_time = 1.0 - (now - self.call_times[0])
            if sleep_time > 0:
                time.sleep(sleep_time)

        self.call_times.append(time.monotonic())


# =========================================================
# 3. 재시도(백오프)가 포함된 API 호출 함수
# =========================================================
# KIS가 "초당 거래건수를 초과하였습니다"라고 응답할 때 내려주는 코드.
# Rate Limiter를 써도 네트워크 지연 등으로 드물게 걸릴 수 있어 재시도 대상으로 처리.
RATE_LIMIT_MSG_CODE = "EGW00201"


def call_kis_api(
    method,
    url,
    headers,
    params=None,
    rate_limiter=None,
    max_retries=3,
    backoff_base=1.0,
):
    """
    KIS API를 호출하고, 실패하면 잠깐 기다렸다가 다시 시도한다 (최대 max_retries회).

    "재시도 백오프"란: 실패할 때마다 대기 시간을 2배씩 늘려가며 재시도하는 방식.
    예) 1번째 실패 → 1초 대기 → 2번째 실패 → 2초 대기 → 3번째 실패 → 4초 대기 → 포기
    (일시적인 네트워크 문제나 순간적인 서버 과부하는 대부분 몇 초 안에 풀리기 때문에,
     바로 포기하지 않고 점점 더 길게 기다리며 몇 번 더 시도해보는 것)

    Parameters
    ----------
    method : "GET" 또는 "POST"
    rate_limiter : RateLimiter 인스턴스 (넘기면 호출 전 자동으로 속도 조절)
    max_retries : 최대 재시도 횟수 (기본 3회 재시도 = 최대 총 4번 시도)
    backoff_base : 첫 대기 시간(초). 이후 2배씩 증가.

    Returns
    -------
    성공 시: 응답 JSON(dict)
    최종 실패 시: None  (호출부에서 None 체크해서 "이 종목은 건너뛰기" 처리)
    """
    for attempt in range(max_retries + 1):
        if rate_limiter:
            rate_limiter.wait_if_needed()

        try:
            if method == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=10)
            else:
                response = requests.post(
                    url, headers=headers, data=json.dumps(params or {}), timeout=10
                )
        except requests.exceptions.RequestException as e:
            logger.warning(f"네트워크 오류 (시도 {attempt + 1}/{max_retries + 1}): {e}")
            _sleep_backoff(attempt, backoff_base)
            continue

        if response.status_code != 200:
            logger.warning(
                f"HTTP {response.status_code} 오류 "
                f"(시도 {attempt + 1}/{max_retries + 1}): {response.text[:200]}"
            )
            _sleep_backoff(attempt, backoff_base)
            continue

        data = response.json()

        if data.get("msg_cd") == RATE_LIMIT_MSG_CODE:
            logger.warning(
                f"초당 거래건수 초과 응답 (시도 {attempt + 1}/{max_retries + 1}) — 대기 후 재시도"
            )
            _sleep_backoff(attempt, backoff_base)
            continue

        # 그 외의 경우는 일단 정상 응답으로 간주하고 반환.
        # (rt_cd != "0" 인 경우 — 예: 상장폐지·신규상장 종목이라 데이터가 없는 경우 —는
        #  API 자체 오류가 아니라 "그 종목에 대한 정상적인 답"일 수 있어 재시도하지 않고
        #  그대로 반환. 호출부에서 rt_cd를 보고 판단하도록 함)
        return data

    logger.error(f"최대 재시도({max_retries}회) 초과 — 이 요청은 실패 처리")
    return None


def _sleep_backoff(attempt, backoff_base):
    wait = backoff_base * (2 ** attempt)
    time.sleep(wait)
