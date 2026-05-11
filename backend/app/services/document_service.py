import re
from pathlib import Path

DOCS_DIR = Path(__file__).parent.parent.parent.parent / "data" / "docs"


def _load_all_chunks() -> list[dict]:
    """
    모든 Markdown 파일을 읽어서 ## / ### 섹션 단위로 청크(chunk) 분할.
    각 청크는 {"file": 파일명, "content": 섹션내용} 형태.
    """
    chunks = []
    if not DOCS_DIR.exists():
        return chunks

    for md_file in DOCS_DIR.glob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        # ## 또는 ### 헤딩 기준으로 섹션 분리
        sections = re.split(r"\n(?=#{1,3} )", content)
        for section in sections:
            section = section.strip()
            if section:
                chunks.append({"file": md_file.stem, "content": section})

    return chunks


def _extract_keywords(query: str) -> list[str]:
    """
    한국어는 '기업에', '취업이'처럼 조사·어미가 붙어 있어
    형태소 분석 없이 원형 매칭이 안 된다.
    각 어절의 접두 부분(1~2자 어미 제거)을 추가로 검색 키워드에 포함시켜 보완.
    """
    keywords: set[str] = set()
    for word in query.lower().split():
        keywords.add(word)
        if len(word) >= 3:
            keywords.add(word[:-1])   # 어미 1자 제거 (기업에→기업)
        if len(word) >= 4:
            keywords.add(word[:-2])   # 어미 2자 제거 (수료하고→수료)
    return list(keywords)


def search_documents(query: str, top_k: int = 3) -> str:
    """
    키워드 기반 Markdown 문서 검색.
    질문 키워드가 많이 포함된 청크를 상위 top_k개 선택하여 반환.
    """
    chunks = _load_all_chunks()
    if not chunks:
        return ""

    keywords = _extract_keywords(query)

    scored: list[tuple[int, str]] = []
    for chunk in chunks:
        content_lower = chunk["content"].lower()
        score = sum(content_lower.count(kw) for kw in keywords)
        if score > 0:
            scored.append((score, chunk["content"]))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_chunks = [c[1] for c in scored[:top_k]]

    return "\n\n---\n\n".join(top_chunks) if top_chunks else ""
