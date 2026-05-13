import json
import math
import re
from pathlib import Path
from typing import Optional

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCS_DIR = ROOT / "data" / "docs"
FAISS_DIR = ROOT / "data" / "faiss_index"
DOC_CATALOG_PATH = DOCS_DIR / "catalog.json"
STOPWORDS = {
    "과정",
    "관련",
    "문의",
    "무엇",
    "뭐",
    "설명",
    "안내",
    "정보",
    "내용",
    "어떤",
    "어떻게",
    "얼마",
    "가능",
    "가요",
    "인가요",
    "있나요",
    "주세요",
    "해줘",
    "정도",
}


def _load_doc_catalog() -> list[dict]:
    if not DOC_CATALOG_PATH.exists():
        return []
    return json.loads(DOC_CATALOG_PATH.read_text(encoding="utf-8")).get("documents", [])


def _load_raw_docs() -> list[tuple[str, dict]]:
    if not DOCS_DIR.exists():
        return []

    catalog = _load_doc_catalog()
    if catalog:
        entries = [
            (
                DOCS_DIR / item["path"],
                {
                    "file": Path(item["path"]).stem,
                    "category": item["category"],
                    "title": item["title"],
                },
            )
            for item in catalog
        ]
    else:
        entries = [(md_file, {"file": md_file.stem}) for md_file in sorted(DOCS_DIR.glob("*.md"))]

    return [
        (md_file.read_text(encoding="utf-8"), metadata)
        for md_file, metadata in entries
        if md_file.exists()
    ]


def _filter_content(content: str) -> str:
    sections = re.split(r"\n(?=## )", content)
    excluded_titles = (
        "참고 질문 추출",
        "원문 기반 상세 내용",
    )
    filtered = [section for section in sections if not any(title in section for title in excluded_titles)]
    return "\n".join(filtered)


def _decorate_chunk(text: str, metadata: dict) -> str:
    title = metadata.get("title", metadata.get("file", ""))
    category = metadata.get("category", "")
    header = []
    if title:
        header.append(f"문서: {title}")
    if category:
        header.append(f"카테고리: {category}")
    if not header:
        return text.strip()
    return "\n".join(header) + "\n\n" + text.strip()


def _normalize_text(text: str) -> str:
    lowered = text.lower()
    cleaned = re.sub(r"[^0-9a-zA-Z가-힣\s]", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()


def _compact_text(text: str) -> str:
    return _normalize_text(text).replace(" ", "")


def _tokenize(text: str) -> list[str]:
    normalized = _normalize_text(text)
    return [token for token in normalized.split() if len(token) >= 2 and token not in STOPWORDS]


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class RAGService:
    def __init__(self, api_key: str):
        FAISS_DIR.mkdir(parents=True, exist_ok=True)
        self._embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            api_key=api_key,
        )
        self._splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.MARKDOWN,
            chunk_size=1200,
            chunk_overlap=150,
        )
        faiss_path = FAISS_DIR / "index.faiss"
        if faiss_path.exists():
            self._vectorstore = FAISS.load_local(
                str(FAISS_DIR),
                self._embeddings,
                allow_dangerous_deserialization=True,
            )
            self._documents = self._load_documents_from_vectorstore()
            self._keyword_index = self._build_keyword_index(self._documents)
        else:
            self._vectorstore = None
            self._documents = []
            self._keyword_index = []

    def _load_documents_from_vectorstore(self) -> list[Document]:
        if self._vectorstore is None:
            return []
        docstore_dict = getattr(getattr(self._vectorstore, "docstore", None), "_dict", {})
        return [doc for doc in docstore_dict.values() if isinstance(doc, Document)]

    def _build_keyword_index(self, documents: list[Document]) -> list[tuple[Document, set[str], str]]:
        index = []
        for doc in documents:
            metadata_text = " ".join(
                str(doc.metadata.get(key, "")) for key in ("title", "category", "file")
            )
            combined_text = f"{metadata_text} {doc.page_content}".strip()
            tokens = set(_tokenize(combined_text))
            index.append((doc, tokens, _normalize_text(combined_text)))
        return index

    def _matches_filter(self, doc: Document, files: set[str] | None = None) -> bool:
        if not files:
            return True
        return doc.metadata.get("file") in files

    def _filter_documents(self, docs: list[Document], files: set[str] | None = None) -> list[Document]:
        return [doc for doc in docs if self._matches_filter(doc, files)]

    def _unique_documents(self, docs: list[Document], top_k: int) -> list[Document]:
        seen = set()
        unique_docs = []
        for doc in docs:
            key = (doc.metadata.get("file"), doc.page_content[:200])
            if key in seen:
                continue
            seen.add(key)
            unique_docs.append(doc)
            if len(unique_docs) >= top_k:
                break
        return unique_docs

    def _vector_search(self, query: str, top_k: int, files: set[str] | None = None) -> list[Document]:
        if self._vectorstore is None:
            return []
        try:
            docs = self._vectorstore.similarity_search(query, k=max(top_k * 4, 10))
        except Exception:
            return []
        return self._unique_documents(self._filter_documents(docs, files), max(top_k * 3, top_k))

    def _mmr_search(self, query: str, top_k: int, files: set[str] | None = None) -> list[Document]:
        if self._vectorstore is None:
            return []
        try:
            docs = self._vectorstore.max_marginal_relevance_search(
                query,
                k=max(top_k * 3, 8),
                fetch_k=max(top_k * 5, 16),
            )
        except Exception:
            return self._vector_search(query, top_k, files)
        return self._unique_documents(self._filter_documents(docs, files), max(top_k * 3, top_k))

    def _keyword_search(self, query: str, top_k: int, files: set[str] | None = None) -> list[Document]:
        if not self._keyword_index:
            return []

        query_tokens = set(_tokenize(query))
        compact_query = _compact_text(query)
        scored: list[tuple[float, Document]] = []

        for doc, doc_tokens, normalized_content in self._keyword_index:
            if files and doc.metadata.get("file") not in files:
                continue

            overlap = len(query_tokens & doc_tokens)
            phrase_bonus = 0.0
            if compact_query and compact_query in normalized_content.replace(" ", ""):
                phrase_bonus += 3.0

            if overlap == 0 and phrase_bonus == 0:
                continue

            score = overlap * 2.0 + phrase_bonus
            scored.append((score, doc))

        scored.sort(key=lambda item: item[0], reverse=True)
        docs = [doc for _, doc in scored]
        return self._unique_documents(docs, max(top_k * 3, top_k))

    def _fuse_ranked_lists(self, ranked_lists: list[list[Document]], top_k: int) -> list[Document]:
        scores: dict[tuple[str, str], float] = {}
        documents: dict[tuple[str, str], Document] = {}

        for ranked in ranked_lists:
            for rank, doc in enumerate(ranked, start=1):
                key = (doc.metadata.get("file", ""), doc.page_content[:200])
                scores[key] = scores.get(key, 0.0) + 1.0 / (rank + 50)
                documents[key] = doc

        fused = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        return [documents[key] for key, _ in fused[: max(top_k * 4, top_k)]]

    def _rerank_documents(self, query: str, docs: list[Document], top_k: int) -> list[Document]:
        if not docs:
            return []

        query_tokens = set(_tokenize(query))
        compact_query = _compact_text(query)
        query_embedding = self._embeddings.embed_query(query)

        doc_texts = [doc.page_content for doc in docs]
        doc_embeddings = self._embeddings.embed_documents(doc_texts)

        scored_docs: list[tuple[float, Document]] = []
        for doc, doc_embedding in zip(docs, doc_embeddings):
            content = doc.page_content
            normalized_content = _normalize_text(content)
            compact_content = normalized_content.replace(" ", "")
            content_tokens = set(_tokenize(content))
            title = str(doc.metadata.get("title", ""))
            category = str(doc.metadata.get("category", ""))
            header_text = f"{title} {category} {doc.metadata.get('file', '')}"

            score = _cosine_similarity(query_embedding, doc_embedding) * 5.0
            score += len(query_tokens & content_tokens) * 1.8

            if compact_query and compact_query in compact_content:
                score += 3.0

            if any(token in header_text.lower() for token in _normalize_text(query).split()):
                score += 1.2

            if "실제 응답 기준" in content:
                score += 2.5
            if "한눈에 보기" in content or "| 항목 |" in content:
                score += 1.0
            if "##" not in content and any(char.isdigit() for char in query):
                score += 0.5
            if any(signal in query for signal in ["얼마", "기간", "몇", "언제", "비용", "교육비"]) and any(
                ch.isdigit() for ch in content
            ):
                score += 1.2
            if any(signal in query for signal in ["차이", "비교", "모두", "같아", "같나요"]):
                if any(token in content for token in ["모두", "같", "차이", "비교"]):
                    score += 1.0
            if any(signal in query for signal in ["어떤 사람", "추천", "맞아", "맞나요"]):
                if any(token in content for token in ["추천 대상", "잘 맞", "어떤 사람"]):
                    score += 1.0

            scored_docs.append((score, doc))

        scored_docs.sort(key=lambda item: item[0], reverse=True)
        reranked = [doc for _, doc in scored_docs]
        return self._unique_documents(reranked, top_k)

    def index_all(self) -> None:
        raw_docs = _load_raw_docs()
        if not raw_docs:
            return

        documents = []
        for content, metadata in raw_docs:
            filtered = _filter_content(content)
            chunks = self._splitter.create_documents([filtered], metadatas=[metadata])
            for chunk in chunks:
                if len(chunk.page_content) >= 50:
                    chunk.page_content = _decorate_chunk(chunk.page_content, metadata)
                    documents.append(chunk)

        self._vectorstore = FAISS.from_documents(documents, self._embeddings)
        self._documents = documents
        self._keyword_index = self._build_keyword_index(documents)
        self._vectorstore.save_local(str(FAISS_DIR))

    def search(
        self,
        query: str,
        top_k: int = 4,
        strategy: str = "hybrid",
        files: list[str] | None = None,
    ) -> str:
        if self._vectorstore is None:
            return ""

        file_filter = set(files or [])

        if strategy == "semantic":
            candidates = self._vector_search(query, top_k, file_filter)
        elif strategy == "keyword":
            candidates = self._keyword_search(query, top_k, file_filter)
        elif strategy == "mmr":
            candidates = self._mmr_search(query, top_k, file_filter)
        else:
            vector_docs = self._vector_search(query, top_k, file_filter)
            keyword_docs = self._keyword_search(query, top_k, file_filter)
            mmr_docs = self._mmr_search(query, top_k, file_filter)
            candidates = self._fuse_ranked_lists([keyword_docs, vector_docs, mmr_docs], top_k)

        docs = self._rerank_documents(query, candidates, top_k)
        return "\n\n---\n\n".join(doc.page_content for doc in docs) if docs else ""


_instance: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    global _instance
    if _instance is None:
        from app.config import get_settings

        _instance = RAGService(get_settings().openai_api_key)
    return _instance
