import re

MAX_BUBBLES = 8

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。！？])\s+")
# `** 단어 **`, `** 단어**`, `**단어 **` 등 별표와 단어 사이 공백을 정규화
_BOLD_WRAP = re.compile(r"\*\*\s*([^\*\n]+?)\s*\*\*")


def _clean_text(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("```", "")
    cleaned = re.sub(r"(?m)^[ \t]{0,3}#{1,6}[ \t]*", "", cleaned)
    cleaned = re.sub(r"(?m)^[ \t]{0,3}>[ \t]*", "", cleaned)
    cleaned = re.sub(r"(?m)^[ \t]*[-*•][ \t]+", "- ", cleaned)
    # 연속된 목록 항목 사이의 빈 줄을 제거 → 한 ul로 묶이게 함
    cleaned = re.sub(r"(?m)(^- [^\n]+)\n+(?=- )", r"\1\n", cleaned)
    # m-dash 주변 공백만 정리 (보존). 줄바꿈은 건드리지 않음.
    cleaned = re.sub(r" +[–—] +", " — ", cleaned)
    # 인라인 hyphen만 마침표로 치환. \s가 줄바꿈을 매칭해 마크다운 목록을 깨뜨리던 버그 수정.
    cleaned = re.sub(r" +- +", ". ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    # 별표 정규화: ReactMarkdown이 인식 못하는 `** 단어 **` 형태를 `**단어**`로 고침
    cleaned = _BOLD_WRAP.sub(lambda m: f"**{m.group(1).strip()}**", cleaned)
    # **강조** 헤더로 시작하는 줄 앞에 빈 줄을 강제 → 각 강조 헤더 단위로 paragraph(말풍선) 분리
    cleaned = re.sub(r"(?<!\n)\n(?=\*\*[^\n]+\*\*)", "\n\n", cleaned)
    cleaned = re.sub(
        r"^\s*(좋아요|네|알겠습니다|확인했습니다|좋은 질문이에요)\s*[-–—:]\s*",
        r"\1. ",
        cleaned,
    )
    cleaned = re.sub(r"^\s*정보\s*정리\s*(해\s*드릴게요)?[.:]?\s*", "", cleaned)
    # 문장 끝(. ! ? ~) 뒤에 공백+다음 문장이 오면 줄바꿈으로 분리해 가독성 보강.
    # URL 내부 마침표(예: encorecampus.ai/)는 공백 없이 이어지므로 영향 없음.
    # `(?<!\d)` 추가: 번호 목록(`1. 본문`, `2. 본문`)의 마침표는 매칭 제외 — 마커와 본문이 끊기지 않게.
    cleaned = re.sub(r"(?<!\d)([.!?~]) +(?=[가-힣A-Za-z(\[•\-*])", r"\1\n", cleaned)
    return cleaned.strip()


def _split_paragraph(paragraph: str) -> list[str]:
    sentences = [part.strip() for part in _SENTENCE_SPLIT.split(paragraph) if part.strip()]
    return sentences or ([paragraph.strip()] if paragraph.strip() else [])


# 한 paragraph 안 줄 수가 이보다 많으면 자동으로 추가 분리(말풍선 쪼개기)
LONG_PARAGRAPH_LINE_THRESHOLD = 3
# 자동 분리할 때 한 말풍선이 가질 줄 수
CHUNK_LINES = 2


def _split_long_paragraph(paragraph: str) -> list[str]:
    """paragraph 안에 \\n이 많으면 CHUNK_LINES 줄씩 묶어 여러 말풍선으로 분리.
    단, `- ` 불릿 줄(목록)은 한 덩어리로 유지해서 ul이 깨지지 않게 함."""
    lines = paragraph.split("\n")
    if len(lines) <= LONG_PARAGRAPH_LINE_THRESHOLD:
        return [paragraph]

    chunks: list[list[str]] = []
    current: list[str] = []
    in_list = False
    for line in lines:
        is_bullet = line.lstrip().startswith("- ")
        if is_bullet:
            in_list = True
            current.append(line)
            continue
        if in_list:
            # 목록 끝났으니 끊고 새 묶음 시작
            chunks.append(current)
            current = [line]
            in_list = False
            continue
        current.append(line)
        if len(current) >= CHUNK_LINES:
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)

    return ["\n".join(ch).strip() for ch in chunks if ch and "\n".join(ch).strip()]


def format_chat_response(text: str, max_bubbles: int = MAX_BUBBLES) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    paragraphs = [part.strip() for part in re.split(r"\n{2,}", cleaned) if part.strip()]
    if not paragraphs:
        return ""

    # 각 paragraph가 너무 길면 (\n이 많으면) 추가 분리
    expanded: list[str] = []
    for p in paragraphs:
        expanded.extend(_split_long_paragraph(p))

    bubbles = expanded[:max_bubbles] if expanded else paragraphs[:max_bubbles]
    return "\n\n".join(bubbles)