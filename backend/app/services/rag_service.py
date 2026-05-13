import json
import re
from pathlib import Path
from typing import Optional

from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCS_DIR = ROOT / "data" / "docs"
CHROMA_DIR = ROOT / "data" / "chroma"
DOC_CATALOG_PATH = DOCS_DIR / "catalog.json"

_COLLECTION_NAME = "documents"
_COLLECTION_METADATA = {"hnsw:space": "cosine"}


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
                {"file": Path(item["path"]).stem, "category": item["category"], "title": item["title"]},
            )
            for item in catalog
        ]
    else:
        entries = [
            (md_file, {"file": md_file.stem})
            for md_file in sorted(DOCS_DIR.glob("*.md"))
        ]

    return [
        (md_file.read_text(encoding="utf-8"), metadata)
        for md_file, metadata in entries
        if md_file.exists()
    ]


def _filter_content(content: str) -> str:
    sections = re.split(r"\n(?=## )", content)
    filtered = [s for s in sections if "참고 원문 추출" not in s]
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


class RAGService:
    def __init__(self, api_key: str):
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        self._embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            api_key=api_key,
        )
        self._splitter = RecursiveCharacterTextSplitter.from_language(
            language=Language.MARKDOWN,
            chunk_size=800,
            chunk_overlap=100,
        )
        self._vectorstore = Chroma(
            collection_name=_COLLECTION_NAME,
            embedding_function=self._embeddings,
            persist_directory=str(CHROMA_DIR),
            collection_metadata=_COLLECTION_METADATA,
        )

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

        self._vectorstore.delete_collection()
        self._vectorstore = Chroma.from_documents(
            documents=documents,
            embedding=self._embeddings,
            collection_name=_COLLECTION_NAME,
            persist_directory=str(CHROMA_DIR),
            collection_metadata=_COLLECTION_METADATA,
        )

    def search(self, query: str, top_k: int = 4) -> str:
        try:
            docs = self._vectorstore.similarity_search(query, k=top_k)
        except Exception:
            return ""
        return "\n\n---\n\n".join(doc.page_content for doc in docs) if docs else ""


_instance: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    global _instance
    if _instance is None:
        from app.config import get_settings
        _instance = RAGService(get_settings().openai_api_key)
    return _instance
