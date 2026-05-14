import re

MAX_BUBBLES = 3
MAX_BUBBLE_CHARS = 120

_SENTENCE_END = re.compile(r"(?<=[.!?\u3002\uff01\uff1f])\s+")


def _clean_paragraph(text: str) -> str:
    cleaned = re.sub(r"[`>#]+", " ", text or "")
    cleaned = re.sub(r"(^|\s)[\-\u2022]\s+", " ", cleaned)
    cleaned = re.sub(r"\s*[\u2013\u2014]\s*", ". ", cleaned)
    cleaned = re.sub(r"\s+-\s+", ". ", cleaned)
    cleaned = re.sub(r"\s*(STEP|Step|step)\s*\d+\.?\s*", " ", cleaned)
    cleaned = re.sub(r"\s*\d+\s*(\uac1c\uc6d4|\uc2dc\uac04)\s*", " ", cleaned)
    cleaned = re.sub(r"\([^)]{8,}\)", " ", cleaned)
    cleaned = re.sub(
        r"^\s*(\uc88b\uc544\uc694|\ub124|\uc54c\uaca0\uc2b5\ub2c8\ub2e4|\ud655\uc778\ud588\uc2b5\ub2c8\ub2e4)\s*[-\u2013\u2014:]\s*",
        r"\1. ",
        cleaned,
    )
    cleaned = re.sub(
        r"^\s*\uc815\ubcf4\s*\uc815\ub9ac\s*(\ud574\s*\ub4dc\ub9b4\uac8c\uc694)?[.:]?\s*",
        "",
        cleaned,
    )
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


def _split_sentences(text: str) -> list[str]:
    sentences = [part.strip() for part in _SENTENCE_END.split(text) if part.strip()]
    return sentences or ([text] if text else [])


def _pack_bubbles(parts: list[str], max_bubbles: int) -> list[str]:
    bubbles: list[str] = []
    current = ""
    current_count = 0

    for part in parts:
        if current and current_count == 1 and len(current) <= 12 and current.endswith(("!", "\uff01")):
            bubbles.append(current)
            current = ""
            current_count = 0

        candidate = f"{current} {part}".strip() if current else part
        if current and (len(candidate) > MAX_BUBBLE_CHARS or current_count >= 2):
            bubbles.append(current)
            current = part
            current_count = 1
        else:
            current = candidate
            current_count += 1

        if len(bubbles) >= max_bubbles:
            break

    if current and len(bubbles) < max_bubbles:
        bubbles.append(current)

    return bubbles[:max_bubbles]


def format_chat_response(text: str, max_bubbles: int = MAX_BUBBLES) -> str:
    paragraphs = []
    for part in re.split(r"\n{2,}", text or ""):
        cleaned = _clean_paragraph(part)
        if cleaned:
            paragraphs.append(cleaned)
    if not paragraphs:
        return ""

    parts: list[str] = []
    for paragraph in paragraphs:
        parts.extend(_split_sentences(paragraph))

    bubbles = _pack_bubbles(parts, max_bubbles)
    return "\n\n".join(bubbles)
