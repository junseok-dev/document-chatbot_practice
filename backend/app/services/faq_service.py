import json
from difflib import SequenceMatcher
from pathlib import Path

FAQ_PATH = Path(__file__).parent.parent.parent.parent / "data" / "faq" / "faq.json"

# 음차·약어·혼용 표기 → 표준 표기 정규화 맵
_NORMALIZE_MAP = {
    # 캠퍼스
    "지벨리": "g밸리",
    "지밸리": "g밸리",
    "g벨리": "g밸리",
    "gvalley": "g밸리",

    # KDT / K-디지털
    "케이디티": "kdt",
    "케이 디티": "kdt",
    "케이디지털": "kdt",
    "케이 디지털": "kdt",
    "k디지털": "kdt",
    "k-디지털": "kdt",

    # MLOps
    "엠엘옵스": "mlops",
    "엠 엘 옵스": "mlops",
    "ml옵스": "mlops",
    "엠엘": "mlops",

    # AI / LLM / RAG
    "에이아이": "ai",
    "인공지능": "ai",
    "엘엘엠": "llm",
    "래그": "rag",

    # IT / API / AWS
    "아이티": "it",
    "에이피아이": "api",
    "에이더블유에스": "aws",
    "에이 더블유 에스": "aws",

    # DevOps / CI/CD
    "데브옵스": "devops",
    "씨아이씨디": "ci/cd",

    # 과정명
    "그래프래그": "graphrag",
    "오토힐링": "autohealing",

    # 기업·브랜드
    "에스케이": "sk",
    "에이치알디": "hrd",

    # 국비·카드
    "내일배움": "국민내일배움카드",
    "내일 배움": "국민내일배움카드",
    "국비지원": "국비",
    "국비 지원": "국비",

    # 일반
    "부트캠프": "부트캠프",
    "bootcamp": "부트캠프",
    "취준생": "취업 준비",
    "취준": "취업 준비",
    "커리큘럼": "커리큘럼",
    "curriculum": "커리큘럼",
    "포트폴리오": "포트폴리오",
    "portfolio": "포트폴리오",
    "인터뷰": "인터뷰",
    "interview": "인터뷰",
}


def _normalize(text: str) -> str:
    result = text.lower()
    for variant, canonical in _NORMALIZE_MAP.items():
        result = result.replace(variant, canonical)
    return result


def _keyword_in_query(keyword: str, query: str, threshold: float = 0.82) -> bool:
    """정확 매칭 우선, 실패 시 슬라이딩 윈도우 퍼지 매칭으로 오타 허용."""
    if keyword in query:
        return True
    # 2자 이하 키워드는 오타 허용 시 오매칭 위험 → 정확 매칭만
    if len(keyword) <= 2:
        return False
    kw_len = len(keyword)
    for i in range(len(query) - kw_len + 1):
        ratio = SequenceMatcher(None, keyword, query[i:i + kw_len]).ratio()
        if ratio >= threshold:
            return True
    return False


def _load_faq_data() -> dict:
    if not FAQ_PATH.exists():
        return {"faqs": [], "suggested_questions": []}
    with open(FAQ_PATH, encoding="utf-8") as f:
        return json.load(f)


def search_faq(query: str) -> str | None:
    """
    키워드 길이 가중치 기반 FAQ 검색.

    score = 매칭된 키워드 글자 수의 합
    - 긴 키워드(국민내일배움카드 8자)는 높은 가중치 → 명확한 매칭
    - 짧은 키워드(어디 2자) 단독으로는 임계값(3) 미달 → 오매칭 차단

    임계값 3의 의미:
      3자 이상 키워드 1개만 매칭해도 통과 (수강료, 교육장 등 전문 용어)
      2자 키워드는 2개 이상 동시 매칭해야 통과 (환불+취소, 강사+누가 등)
    """
    data = _load_faq_data()
    query_lower = _normalize(query)

    best_answer: str | None = None
    best_score = 0

    for faq in data.get("faqs", []):
        score = sum(len(kw) for kw in faq.get("keywords", []) if _keyword_in_query(_normalize(kw), query_lower))
        if score > best_score:
            best_score = score
            best_answer = faq["answer"]

    # 최소 임계값 3 미달 시 문서 검색으로 위임
    return best_answer if best_score >= 3 else None


def get_suggested_questions() -> list[dict]:
    """추천 질문 버튼 목록 반환"""
    data = _load_faq_data()
    return data.get("suggested_questions", [])
