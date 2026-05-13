import json
import re
from difflib import SequenceMatcher
from pathlib import Path

FAQ_PATH = Path(__file__).parent.parent.parent.parent / "data" / "faq" / "faq.json"
STOPWORDS = {
    "안내",
    "가요",
    "가능",
    "가능한가요",
    "관련",
    "문의",
    "무엇",
    "뭐",
    "뭔가요",
    "물어",
    "주세요",
    "알려줘",
    "알려주세요",
    "설명",
    "정보",
    "내용",
}


def _normalize(text: str) -> str:
    lowered = text.lower()
    cleaned = re.sub(r"[^0-9a-zA-Z가-힣\s]", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()


def _compact(text: str) -> str:
    return _normalize(text).replace(" ", "")


def _load_faq_data() -> dict:
    if not FAQ_PATH.exists():
        return {"faqs": [], "suggested_questions": [], "categories": []}
    return json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in _normalize(text).split()
        if len(token) >= 2 and token not in STOPWORDS
    }


def _iter_match_texts(faq: dict) -> list[str]:
    texts = [faq.get("question", "")]
    texts.extend(faq.get("keywords", []))
    texts.extend(faq.get("aliases", []))
    texts.extend(faq.get("search_hints", []))
    category = faq.get("category")
    if category:
        texts.append(category)
    return [text for text in texts if text]


def _score_faq(query: str, faq: dict) -> float:
    normalized_query = _normalize(query)
    compact_query = _compact(query)
    if not normalized_query:
        return 0.0

    query_tokens = _tokenize(query)
    score = 0.0

    question = faq.get("question", "")
    normalized_question = _normalize(question)
    compact_question = _compact(question)
    question_tokens = _tokenize(question)

    if compact_query == compact_question:
        score += 14.0
    elif compact_query and compact_question and (
        compact_query in compact_question or compact_question in compact_query
    ):
        score += 9.0
    else:
        ratio = SequenceMatcher(None, compact_query, compact_question).ratio()
        if ratio >= 0.68:
            score += ratio * 7.0

    score += len(query_tokens & question_tokens) * 2.8

    for text in _iter_match_texts(faq):
        normalized_text = _normalize(text)
        compact_text = normalized_text.replace(" ", "")
        text_tokens = _tokenize(text)

        if compact_text and compact_text in compact_query:
            score += max(2.5, min(len(compact_text) * 0.45, 6.0))
            continue

        overlap = len(query_tokens & text_tokens)
        if overlap:
            score += overlap * 1.8
            continue

        ratio = SequenceMatcher(None, compact_query, compact_text).ratio()
        if ratio >= 0.72:
            score += ratio * 3.5

    return score


def search_faq(query: str) -> str | None:
    if not is_guide_query(query):
        return None

    matched = match_faq(query)
    if not matched:
        return None

    best_score, faq = matched
    if not faq.get("direct_answer", False):
        return None
    if best_score < 7.0:
        return None
    return faq.get("answer")


def match_faq(query: str) -> tuple[float, dict] | None:
    data = _load_faq_data()

    best_faq: dict | None = None
    best_score = 0.0
    for faq in data.get("faqs", []):
        score = _score_faq(query, faq)
        if score > best_score:
            best_score = score
            best_faq = faq

    if not best_faq:
        return None
    return best_score, best_faq


def is_guide_query(query: str) -> bool:
    normalized = _normalize(query)
    guide_signals = [
        "어떤 질문",
        "질문 추천",
        "무슨 질문",
        "뭘 물어",
        "뭐 물어",
        "카테고리",
        "뭐부터",
        "처음인데",
        "어디부터",
        "무엇을 물어",
    ]
    return any(signal in normalized for signal in guide_signals)


def get_suggested_questions() -> list[dict]:
    data = _load_faq_data()
    return data.get("suggested_questions", [])
