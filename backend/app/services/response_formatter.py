import re

MAX_BUBBLES = 3

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。！？])\s+")


def _clean_text(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("```", "")
    cleaned = re.sub(r"(?m)^[ \t]{0,3}#{1,6}[ \t]*", "", cleaned)
    cleaned = re.sub(r"(?m)^[ \t]{0,3}>[ \t]*", "", cleaned)
    cleaned = re.sub(r"(?m)^[ \t]*[-*•][ \t]+", "• ", cleaned)
    cleaned = re.sub(r"\s*[\u2013\u2014]\s*", ". ", cleaned)
    cleaned = re.sub(r"\s+-\s+", ". ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(
        r"^\s*(좋아요|네|알겠습니다|확인했습니다|좋은 질문이에요)\s*[-\u2013\u2014:]\s*",
        r"\1. ",
        cleaned,
    )
    cleaned = re.sub(r"^\s*정보\s*정리\s*(해\s*드릴게요)?[.:]?\s*", "", cleaned)
    return cleaned.strip()


def _split_paragraph(paragraph: str) -> list[str]:
    sentences = [part.strip() for part in _SENTENCE_SPLIT.split(paragraph) if part.strip()]
    return sentences or ([paragraph.strip()] if paragraph.strip() else [])


def format_chat_response(text: str, max_bubbles: int = MAX_BUBBLES) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    paragraphs = [part.strip() for part in re.split(r"\n{2,}", cleaned) if part.strip()]
    if not paragraphs:
        return ""

    bubbles: list[str] = []
    if len(paragraphs) > 1:
        bubbles = paragraphs[:max_bubbles]
    elif "\n" in paragraphs[0]:
        bubbles = [paragraphs[0]]
    else:
        bubbles = _split_paragraph(paragraphs[0])[:max_bubbles]

    return "\n\n".join(bubbles)
