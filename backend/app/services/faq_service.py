import json
from pathlib import Path

FAQ_PATH = Path(__file__).parent.parent.parent.parent / "data" / "faq" / "faq.json"

# 음차·약어·혼용 표기 → 표준 표기 정규화 맵
_NORMALIZE_MAP = {
    "지벨리": "g밸리",
    "지밸리": "g밸리",
    "g벨리": "g밸리",
    "gvalley": "g밸리",
    "케이디티": "kdt",
    "k디지털": "kdt",
    "k-디지털": "kdt",
    "엠엘옵스": "mlops",
    "ml옵스": "mlops",
    "에이아이": "ai",
    "인공지능": "ai",
    "내일배움": "국민내일배움카드",
    "내일 배움": "국민내일배움카드",
    "국비지원": "국비",
    "국비 지원": "국비",
    "부트캠프": "부트캠프",
    "bootcamp": "부트캠프",
    "취준생": "취업 준비",
    "취준": "취업 준비",
}


def _normalize(text: str) -> str:
    result = text.lower()
    for variant, canonical in _NORMALIZE_MAP.items():
        result = result.replace(variant, canonical)
    return result


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
        score = sum(len(kw) for kw in faq.get("keywords", []) if _normalize(kw) in query_lower)
        if score > best_score:
            best_score = score
            best_answer = faq["answer"]

    # 최소 임계값 3 미달 시 문서 검색으로 위임
    return best_answer if best_score >= 3 else None


def get_suggested_questions() -> list[dict]:
    """추천 질문 버튼 목록 반환"""
    data = _load_faq_data()
    return data.get("suggested_questions", [])
