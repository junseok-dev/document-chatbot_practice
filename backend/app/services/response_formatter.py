import re

MAX_LINE_CHARS = 15
MAX_LINES = 6

_STYLE_BREAKS = (
    "\uc774\uace0",
    "\uace0",
    "\uc774\uba70",
    "\uba70",
    "\uc9c0\ub9cc",
    "\ub77c\uc11c",
    "\ud574\uc11c",
    "\ub2c8\uae4c",
    "\uc778\ub370",
    "\uc73c\ub2c8",
    "\uba74",
)

_SENTENCE_BREAKS = re.compile(r"(?<=[.!?\u3002\uff01\uff1f])\s+")


def _clean_text(text: str) -> str:
    cleaned = re.sub(r"[*_`>#-]+", " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _find_breakpoint(text: str) -> int:
    limit = min(len(text), MAX_LINE_CHARS)
    window = text[:limit]

    for mark in ("\u3002", ".", "!", "?", ":", ";", ",", "\uff0c"):
        idx = window.rfind(mark)
        if idx >= 3:
            return idx + 1

    for marker in _STYLE_BREAKS:
        idx = window.rfind(marker)
        if idx >= 3:
            return idx + len(marker)

    idx = window.rfind(" ")
    if idx >= 3:
        return idx

    return limit


def _split_to_short_lines(text: str) -> list[str]:
    lines: list[str] = []
    for sentence in _SENTENCE_BREAKS.split(text):
        remaining = sentence.strip()
        while remaining:
            if len(remaining) <= MAX_LINE_CHARS:
                lines.append(remaining)
                break

            break_at = _find_breakpoint(remaining)
            line = remaining[:break_at].strip(" ,")
            if line:
                lines.append(line)
            remaining = remaining[break_at:].strip(" ,")

            if len(lines) >= MAX_LINES:
                return lines

    return lines


def format_chat_response(text: str, max_lines: int = MAX_LINES) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    lines = _split_to_short_lines(cleaned)
    return "\n".join(lines[:max_lines])
