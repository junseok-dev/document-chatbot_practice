import re

MAX_BUBBLES = 3
MAX_BUBBLE_CHARS = 64

_SENTENCE_END = re.compile(r"(?<=[.!?\u3002\uff01\uff1f])\s+")
_SOFT_BREAK_MARKERS = (
    "\uc774\uace0",
    "\uc774\uba70",
    "\uc778\ub370",
    "\uc9c0\ub9cc",
    "\ub77c\uc11c",
    "\ud574\uc11c",
    "\ub2c8\uae4c",
    "\uace0",
    "\uba70",
)


def _clean_text(text: str) -> str:
    cleaned = re.sub(r"[`>#]+", " ", text or "")
    cleaned = re.sub(r"(^|\s)[\-•]\s+", " ", cleaned)
    cleaned = re.sub(r"\s*[\u2013\u2014]\s*", ". ", cleaned)
    cleaned = re.sub(r"\s+-\s+", ". ", cleaned)
    cleaned = re.sub(r"\s*(STEP|Step|step)\s*\d+\.?\s*", " ", cleaned)
    cleaned = re.sub(r"\s*\d+\s*(개월|시간)\s*", " ", cleaned)
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
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _split_sentences(text: str) -> list[str]:
    sentences = [part.strip() for part in _SENTENCE_END.split(text) if part.strip()]
    return sentences or [text]


def _split_long_sentence(sentence: str) -> list[str]:
    if len(sentence) <= MAX_BUBBLE_CHARS:
        return [sentence]

    parts: list[str] = []
    remaining = sentence.strip()
    while len(remaining) > MAX_BUBBLE_CHARS:
        window = remaining[:MAX_BUBBLE_CHARS]
        break_at = -1

        for marker in _SOFT_BREAK_MARKERS:
            idx = window.rfind(marker)
            if idx >= 20:
                break_at = idx + len(marker)
                break

        if break_at < 0:
            for mark in (",", "\uff0c", ":", ";", " "):
                idx = window.rfind(mark)
                if idx >= 20:
                    break_at = idx + 1
                    break

        if break_at < 0:
            break_at = MAX_BUBBLE_CHARS

        parts.append(remaining[:break_at].strip(" ,"))
        remaining = remaining[break_at:].strip(" ,")

    if remaining:
        parts.append(remaining)
    return parts


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
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    parts: list[str] = []
    for sentence in _split_sentences(cleaned):
        parts.extend(_split_long_sentence(sentence))

    bubbles = _pack_bubbles(parts, max_bubbles)
    return "\n\n".join(bubbles)
