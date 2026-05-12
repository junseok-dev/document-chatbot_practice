import re
from pathlib import Path
from typing import Optional

import chromadb
from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCS_DIR = ROOT / "data" / "docs"
CHROMA_DIR = ROOT / "data" / "chroma"


def _load_chunks() -> list[dict]:
    chunks = []
    if not DOCS_DIR.exists():
        return chunks
    for md_file in sorted(DOCS_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        sections = re.split(r"\n(?=#{1,3} )", content)
        for i, section in enumerate(sections):
            section = section.strip()
            if len(section) >= 50:
                chunks.append({
                    "id": f"{md_file.stem}__{i}",
                    "text": section,
                    "metadata": {"file": md_file.stem},
                })
    return chunks


class RAGService:
    def __init__(self, api_key: str):
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        self._openai = OpenAI(api_key=api_key)
        self._chroma = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self._col = self._chroma.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"},
        )

    def _embed(self, texts: list[str]) -> list[list[float]]:
        response = self._openai.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]

    def index_all(self) -> None:
        chunks = _load_chunks()
        if not chunks:
            return

        existing = self._col.get()
        if existing["ids"]:
            self._col.delete(ids=existing["ids"])

        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            embeddings = self._embed([c["text"] for c in batch])
            self._col.add(
                ids=[c["id"] for c in batch],
                documents=[c["text"] for c in batch],
                embeddings=embeddings,
                metadatas=[c["metadata"] for c in batch],
            )

    def search(self, query: str, top_k: int = 4) -> str:
        if self._col.count() == 0:
            return ""
        query_emb = self._embed([query])[0]
        results = self._col.query(
            query_embeddings=[query_emb],
            n_results=min(top_k, self._col.count()),
        )
        docs = results.get("documents", [[]])[0]
        return "\n\n---\n\n".join(docs) if docs else ""


_instance: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    global _instance
    if _instance is None:
        from app.config import get_settings
        _instance = RAGService(get_settings().openai_api_key)
    return _instance
