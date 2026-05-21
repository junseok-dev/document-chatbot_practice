import re

MAX_BUBBLES = 8

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?。！？])\s+")
# `** 단어 **`, `** 단어**`, `**단어 **` 등 별표와 단어 사이 공백을 정규화
_BOLD_WRAP = re.compile(r"\*\*\s*([^\*\n]+?)\s*\*\*")
# `**(ZOOM, 약 20분)**가` 처럼 닫는 별표 앞이 punctuation, 뒤가 한글/영문/숫자면
# CommonMark의 right-flanking 규칙 위반으로 볼드가 적용되지 않아 별표가 그대로 노출됨.
# 닫는 `**` 뒤에 NBSP(U+00A0, Unicode whitespace)를 삽입해 규칙을 만족시킴.
_BOLD_CLOSE_FIX = re.compile(r"(\*\*[^*\n]+?[^\w\s*])\*\*(?=[\w가-힣])")


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
    # `**…)**한글` 처럼 punct 닫기 + 한글 이어붙음 → NBSP 삽입으로 볼드 적용 보장
    cleaned = _BOLD_CLOSE_FIX.sub(lambda m: f"{m.group(1)}** ", cleaned)
    # **강조** 헤더로 시작하는 줄 앞에 빈 줄을 강제 → 각 강조 헤더 단위로 paragraph(말풍선) 분리
    cleaned = re.sub(r"(?<!\n)\n(?=\*\*[^\n]+\*\*)", "\n\n", cleaned)
    # **강조** 헤더 줄 뒤에도 빈 줄 강제 → 다음에 오는 목록(- 또는 1.)이 별도 paragraph로 인식되어 ul/ol 변환됨
    cleaned = re.sub(r"(\*\*[^\n]+\*\*[ \t]*)\n(?!\n)", r"\1\n\n", cleaned)
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


def format_chat_response(text: str, max_bubbles: int = MAX_BUBBLES) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    # paragraph break(빈 줄, \n\n) 기준으로만 말풍선 분리.
    # 같은 paragraph 안 내용(마침표 줄바꿈 포함)은 절대 쪼개지 않고 한 말풍선에 통째로 유지.
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", cleaned) if part.strip()]
    if not paragraphs:
        return ""

    if len(paragraphs) > 1:
        bubbles = paragraphs[:max_bubbles]
    elif "\n" in paragraphs[0]:
        bubbles = [paragraphs[0]]
    else:
        bubbles = _split_paragraph(paragraphs[0])[:max_bubbles]

    return "\n\n".join(bubbles)