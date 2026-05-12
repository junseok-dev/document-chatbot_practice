from app.services.rag_service import get_rag_service


def search_documents(query: str, top_k: int = 4) -> str:
    return get_rag_service().search(query, top_k)
