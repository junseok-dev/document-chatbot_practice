import json
import re
from difflib import SequenceMatcher
from pathlib import Path

FAQ_PATH = Path(__file__).parent.parent.parent.parent / "data" / "faq" / "faq.json"
STOPWORDS = {
    "안내",
    "가능",
    "가능한가요",
    "궁금",
    "궁금해요",
    "관련",
    "문의",
    "무엇",
    "뭔가요",
    "알려주세요",
    "있나요",
    "있을까요",
    "지원",
    "정보",
    "내용",
    "설명",
}


def _normalize(text: str) -> str:
    lowered = text.lower()
    cleaned = re.sub(r"[^0-9a-zA-Z가-힣\s]", " ", lowered)
    collapsed = re.sub(r"\s+", " ", cleaned).strip()
    return collapsed


def _compact(text: str) -> str:
    return _normalize(text).replace(" ", "")


def _load_faq_data() -> dict:
    if not FAQ_PATH.exists():
        return {"faqs": [], "suggested_questions": []}
    return json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def _score_faq(query: str, faq: dict) -> float:
    score = 0.0
    normalized_query = _normalize(query)
    compact_query = _compact(query)
    normalized_question = _normalize(faq.get("question", ""))
    compact_question = _compact(faq.get("question", ""))
    normalized_keywords = [_normalize(keyword) for keyword in faq.get("keywords", [])]
    query_tokens = {
        token for token in normalized_query.split()
        if len(token) >= 2 and token not in STOPWORDS
    }
    question_tokens = {
        token for token in normalized_question.split()
        if len(token) >= 2 and token not in STOPWORDS
    }

    if not normalized_query:
        return score

    if compact_query == compact_question:
        score += 12
    elif compact_query in compact_question or compact_question in compact_query:
        score += 8
    else:
        question_ratio = SequenceMatcher(None, compact_query, compact_question).ratio()
        if question_ratio >= 0.72:
            score += question_ratio * 6

    score += len(query_tokens & question_tokens) * 2.5

    for keyword in normalized_keywords:
        if not keyword:
            continue
        compact_keyword = _compact(keyword)
        if compact_keyword and compact_keyword in compact_query:
            score += max(3, len(keyword))
            continue

        keyword_parts = keyword.split()
        matched_parts = [part for part in keyword_parts if len(part) >= 2 and part in normalized_query]
        score += len(matched_parts) * 1.5

    return score


def search_faq(query: str) -> str | None:
    data = _load_faq_data()

    best_answer: str | None = None
    best_score = 0.0
    for faq in data.get("faqs", []):
        score = _score_faq(query, faq)
        if score > best_score:
            best_score = score
            best_answer = faq.get("answer")

    return best_answer if best_score >= 6 else None


def get_suggested_questions() -> list[dict]:
    data = _load_faq_data()
    return data.get("suggested_questions", [])
