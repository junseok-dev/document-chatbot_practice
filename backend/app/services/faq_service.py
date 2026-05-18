import json
import re
from difflib import SequenceMatcher
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.database import SessionLocal
from app.db.models import FaqRecord
from app.services.storage_service import build_s3_key, read_text_from_storage, upload_text_to_s3
from app.utils.crypto import decrypt_if_needed, maybe_encrypt

FAQ_PATH = Path(__file__).parent.parent.parent.parent / "data" / "faq" / "faq.json"
FAQ_STORAGE_KEY = build_s3_key("faq", "faq.json")
STOPWORDS = {
    "안내",
    "가능",
    "관련",
    "문의",
    "무엇",
    "뭐",
    "설명",
    "정보",
    "이용",
}


def _normalize(text: str) -> str:
    lowered = (text or "").lower()
    cleaned = re.sub(r"[^0-9a-zA-Z가-힣\s]", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()


def _compact(text: str) -> str:
    return _normalize(text).replace(" ", "")


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in _normalize(text).split()
        if len(token) >= 2 and token not in STOPWORDS
    }


def _load_faq_json() -> dict:
    # 로컬 파일 우선 (git 배포 시 최신 데이터 반영)
    if FAQ_PATH.exists():
        return json.loads(FAQ_PATH.read_text(encoding="utf-8"))
    if get_settings().aws_s3_bucket:
        try:
            remote = read_text_from_storage(f"s3://{get_settings().aws_s3_bucket}/{FAQ_STORAGE_KEY}")
            if remote:
                return json.loads(remote)
        except Exception:
            pass
    return {"faqs": [], "suggested_questions": [], "categories": []}


def _serialize_faq(record: FaqRecord) -> dict:
    return {
        "id": record.faq_key,
        "category": decrypt_if_needed(record.category) or "",
        "question": decrypt_if_needed(record.question) or "",
        "answer": decrypt_if_needed(record.answer) or "",
        "keywords": json.loads(decrypt_if_needed(record.keywords_json) or "[]"),
        "aliases": json.loads(decrypt_if_needed(record.aliases_json) or "[]"),
        "search_hints": json.loads(decrypt_if_needed(record.search_hints_json) or "[]"),
        "source_files": json.loads(decrypt_if_needed(record.source_files_json) or "[]"),
        "direct_answer": record.direct_answer,
        "top_k": record.top_k,
    }


def seed_faqs(db: Session) -> None:
    payload = _load_faq_json()
    json_keys = {faq.get("id") for faq in payload.get("faqs", []) if faq.get("id")}

    # 현재 JSON에 없는 DB 레코드 삭제
    db.query(FaqRecord).filter(FaqRecord.faq_key.notin_(json_keys)).delete(synchronize_session=False)

    for faq in payload.get("faqs", []):
        faq_key = faq.get("id")
        if not faq_key:
            continue
        existing = db.query(FaqRecord).filter(FaqRecord.faq_key == faq_key).first()
        if existing:
            existing.category = maybe_encrypt(faq.get("category", ""))
            existing.question = maybe_encrypt(faq.get("question", ""))
            existing.answer = maybe_encrypt(faq.get("answer", ""))
            existing.keywords_json = maybe_encrypt(json.dumps(faq.get("keywords", []), ensure_ascii=False))
            existing.aliases_json = maybe_encrypt(json.dumps(faq.get("aliases", []), ensure_ascii=False))
            existing.search_hints_json = maybe_encrypt(json.dumps(faq.get("search_hints", []), ensure_ascii=False))
            existing.source_files_json = maybe_encrypt(json.dumps(faq.get("source_files", []), ensure_ascii=False))
            existing.direct_answer = bool(faq.get("direct_answer", False))
            existing.top_k = int(faq.get("top_k", 4) or 4)
            existing.is_active = True
        else:
            db.add(
                FaqRecord(
                    faq_key=faq_key,
                    category=maybe_encrypt(faq.get("category", "")),
                    question=maybe_encrypt(faq.get("question", "")),
                    answer=maybe_encrypt(faq.get("answer", "")),
                    keywords_json=maybe_encrypt(json.dumps(faq.get("keywords", []), ensure_ascii=False)),
                    aliases_json=maybe_encrypt(json.dumps(faq.get("aliases", []), ensure_ascii=False)),
                    search_hints_json=maybe_encrypt(json.dumps(faq.get("search_hints", []), ensure_ascii=False)),
                    source_files_json=maybe_encrypt(json.dumps(faq.get("source_files", []), ensure_ascii=False)),
                    direct_answer=bool(faq.get("direct_answer", False)),
                    top_k=int(faq.get("top_k", 4) or 4),
                    is_active=True,
                )
            )
    db.commit()


def sync_faqs_to_file(db: Session) -> None:
    seed_faqs(db)
    payload = _load_faq_json()
    payload["faqs"] = [_serialize_faq(row) for row in db.query(FaqRecord).filter(FaqRecord.is_active.is_(True)).order_by(FaqRecord.id.asc()).all()]
    FAQ_PATH.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, indent=2)
    FAQ_PATH.write_text(content, encoding="utf-8")
    uploaded = upload_text_to_s3(content, FAQ_STORAGE_KEY, content_type="application/json; charset=utf-8")
    if uploaded and FAQ_PATH.exists():
        FAQ_PATH.unlink()


_faq_seeded = False


def _get_faq_data() -> dict:
    global _faq_seeded
    db = SessionLocal()
    try:
        if not _faq_seeded:
            seed_faqs(db)
            _faq_seeded = True
        rows = db.query(FaqRecord).filter(FaqRecord.is_active.is_(True)).order_by(FaqRecord.id.asc()).all()
        payload = _load_faq_json()
        payload["faqs"] = [_serialize_faq(row) for row in rows]
        return payload
    finally:
        db.close()


def _iter_match_texts(faq: dict) -> list[str]:
    texts = [faq.get("question", "")]
    texts.extend(faq.get("keywords", []))
    texts.extend(faq.get("aliases", []))
    texts.extend(faq.get("search_hints", []))
    if faq.get("category"):
        texts.append(faq["category"])
    return [text for text in texts if text]


def _score_faq(query: str, faq: dict) -> float:
    normalized_query = _normalize(query)
    compact_query = _compact(query)
    if not normalized_query:
        return 0.0

    query_tokens = _tokenize(query)
    score = 0.0

    question = faq.get("question", "")
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
        compact_text = _compact(text)
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


def match_faq(query: str) -> tuple[float, dict] | None:
    data = _get_faq_data()
    best_faq = None
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
        "뭐 물어봐",
        "카테고리",
        "처음인데",
        "무엇을 물어",
        "어떤 걸 물어",   # "법 관련해서는 어떤 걸 물어보면 돼?"
        "어떤 거 물어",   # 맞춤법 변형
        "뭘 물어",         # "엔코아 ai 캠퍼스 정보 쪽에서는 뭘 물어보면 돼?"
        "물어볼 수 있",   # "어떤 걸 물어볼 수 있어?"
        "질문할 수 있",
        "어떤 내용",
        "무슨 내용",
    ]
    return any(signal in normalized for signal in guide_signals)


def search_faq(query: str) -> str | None:
    if not is_guide_query(query):
        return None

    matched = match_faq(query)
    if not matched:
        return None

    best_score, faq = matched
    if not faq.get("direct_answer", False):
        return None
    if best_score < 6.0:
        return None
    return faq.get("answer")


def match_button_faq(query: str) -> str | None:
    """버튼 클릭처럼 쿼리가 FAQ 질문과 정확히 일치할 때 direct_answer 반환."""
    matched = match_faq(query)
    if not matched:
        return None
    score, faq = matched
    if faq.get("direct_answer") and score >= 10.0:
        return faq.get("answer")
    return None


def match_faq_general(query: str, threshold: float = 6.0) -> str | None:
    """일반 대화에서 direct_answer FAQ와 충분히 매칭될 때 답변 반환."""
    matched = match_faq(query)
    if not matched:
        return None
    score, faq = matched
    if faq.get("direct_answer") and score >= threshold:
        return faq.get("answer")
    return None


def get_suggested_questions() -> list[dict]:
    return _load_faq_json().get("suggested_questions", [])
