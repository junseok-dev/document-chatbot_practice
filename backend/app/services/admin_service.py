from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import DocumentRecord, FaqRecord, ProcessingLog
from app.services.faq_service import seed_faqs, sync_faqs_to_file
from app.services.rag_service import get_rag_service
from app.services.storage_service import (
    MANAGED_CHUNKS_DIR,
    MANAGED_DOCS_DIR,
    MANAGED_EMBEDDINGS_DIR,
    MANAGED_JSON_DIR,
    PDF_DIR,
    delete_s3_key,
    ensure_storage_dirs,
    safe_unlink,
    upload_file_to_s3,
)
from app.services.transformation_service import convert_markdown_to_faq_items
from app.utils.crypto import maybe_encrypt
from app.utils.pdf_converter import convert_pdf_to_md


def _slugify(value: str) -> str:
    lowered = re.sub(r"[^\w]+", "_", Path(value).stem.lower()).strip("_")
    return lowered or "document"


def _next_version(db: Session, logical_name: str) -> int:
    existing = (
        db.query(DocumentRecord)
        .filter(DocumentRecord.logical_name == logical_name)
        .order_by(DocumentRecord.version.desc())
        .first()
    )
    return (existing.version if existing else 0) + 1


def create_processing_log(
    db: Session,
    log_type: str,
    status: str,
    message: str,
    document_id: int | None = None,
    detail: str | None = None,
) -> None:
    db.add(
        ProcessingLog(
            document_id=document_id,
            log_type=log_type,
            status=status,
            message=maybe_encrypt(message),
            detail=maybe_encrypt(detail),
        )
    )
    db.commit()


async def _process_md_content(
    db: Session,
    filename: str,
    md_content: str,
    title: str,
    category: str,
    reindex: bool = True,
) -> DocumentRecord:
    logical_name = _slugify(Path(filename).stem)
    version = _next_version(db, logical_name)

    managed_md_path = MANAGED_DOCS_DIR / f"{logical_name}_v{version}.md"
    managed_md_path.write_text(md_content, encoding="utf-8")

    record = DocumentRecord(
        logical_name=logical_name,
        version=version,
        original_filename=maybe_encrypt(filename),
        storage_key=None,
        md_path=str(managed_md_path),
        parser_type="markdown",
        status="embedding",
        is_active=False,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    create_processing_log(db, "document", "uploaded", f"{filename} MD 업로드 완료", document_id=record.id)

    try:
        rag = get_rag_service()
        chunks = rag.build_chunks_for_markdown(
            md_content,
            {
                "file": logical_name,
                "title": title,
                "category": category,
                "document_id": record.id,
                "source_type": "document",
            },
        )
        rag.replace_document_chunks(db, record.id, chunks)

        json_path = MANAGED_JSON_DIR / f"{logical_name}_v{version}.json"
        json_path.write_text(
            json.dumps(
                {
                    "document_id": record.id,
                    "logical_name": logical_name,
                    "version": version,
                    "original_filename": filename,
                    "title": title,
                    "category": category,
                    "status": "ready",
                    "chunk_count": len(chunks),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        chunk_path = MANAGED_CHUNKS_DIR / f"{logical_name}_v{version}.json"
        chunk_path.write_text(
            json.dumps(
                [
                    {"index": i, "content": chunk.page_content, "metadata": chunk.metadata}
                    for i, chunk in enumerate(chunks)
                ],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        embedding_path = MANAGED_EMBEDDINGS_DIR / f"{logical_name}_v{version}.json"
        embedding_path.write_text(
            json.dumps(
                {
                    "document_id": record.id,
                    "embedding_model": get_settings().embedding_model,
                    "strategy": "full_rebuild",
                    "chunk_count": len(chunks),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        record.json_path = str(json_path)
        record.chunk_path = str(chunk_path)
        record.embedding_path = str(embedding_path)

        old_records = (
            db.query(DocumentRecord)
            .filter(
                DocumentRecord.logical_name == logical_name,
                DocumentRecord.id != record.id,
                DocumentRecord.is_active.is_(True),
            )
            .all()
        )
        for old in old_records:
            delete_document_assets(db, old)

        record.is_active = True
        record.status = "ready"
        record.error_message = None
        db.commit()
        if reindex:
            rag.index_all(db)
        create_processing_log(db, "document", "ready", "문서 활성화 완료", document_id=record.id)
        db.refresh(record)
        return record
    except Exception as exc:
        record.status = "failed"
        record.error_message = maybe_encrypt(str(exc))
        db.commit()
        create_processing_log(db, "document", "failed", "문서 처리 실패", document_id=record.id, detail=str(exc))
        raise


async def process_uploaded_md(
    db: Session,
    filename: str,
    content: bytes,
    title: str | None = None,
    category: str | None = None,
) -> DocumentRecord:
    md_content = content.decode("utf-8")
    return await _process_md_content(
        db,
        filename=filename,
        md_content=md_content,
        title=title or Path(filename).stem,
        category=category or "document",
        reindex=True,
    )


async def process_uploaded_faq_md(
    db: Session,
    filename: str,
    content: bytes,
    category: str | None = None,
) -> tuple[DocumentRecord, list[dict]]:
    ensure_storage_dirs()
    md_content = content.decode("utf-8")
    logical_name = _slugify(Path(filename).stem)
    version = _next_version(db, logical_name)

    managed_md_path = MANAGED_DOCS_DIR / f"{logical_name}_v{version}.md"
    managed_md_path.write_text(md_content, encoding="utf-8")

    faq_items = await convert_markdown_to_faq_items(md_content, category=category)
    managed_json_path = MANAGED_JSON_DIR / f"{logical_name}_v{version}.faq.json"
    managed_json_path.write_text(json.dumps(faq_items, ensure_ascii=False, indent=2), encoding="utf-8")

    record = DocumentRecord(
        logical_name=logical_name,
        version=version,
        original_filename=maybe_encrypt(filename),
        storage_key=None,
        md_path=str(managed_md_path),
        json_path=str(managed_json_path),
        parser_type="faq_json",
        status="ready",
        is_active=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    create_processing_log(db, "faq_import", "ready", f"{filename} FAQ JSON 변환 완료", document_id=record.id)
    return record, faq_items


async def process_catalog_import(
    db: Session,
    catalog: dict,
    md_files: dict[str, bytes],
) -> list[DocumentRecord]:
    records = []
    entries = catalog.get("documents", [])
    for entry in entries:
        path = entry.get("path", "")
        filename = Path(path).name
        if filename not in md_files:
            continue
        title = entry.get("title") or Path(filename).stem
        category = entry.get("category") or "document"
        try:
            record = await _process_md_content(
                db,
                filename=filename,
                md_content=md_files[filename].decode("utf-8"),
                title=title,
                category=category,
                reindex=False,
            )
            records.append(record)
        except Exception as exc:
            create_processing_log(db, "document", "failed", f"{filename} 처리 실패: {exc}")
    get_rag_service().index_all(db)
    return records


async def process_uploaded_pdf(db: Session, filename: str, content: bytes) -> DocumentRecord:
    ensure_storage_dirs()
    logical_name = _slugify(filename)
    version = _next_version(db, logical_name)
    stored_filename = f"{logical_name}_v{version}.pdf"
    pdf_path = PDF_DIR / stored_filename
    pdf_path.write_bytes(content)

    settings = get_settings()
    storage_key = f"{settings.aws_s3_prefix.rstrip('/')}/pdf/{stored_filename}" if settings.aws_s3_bucket else None
    upload_file_to_s3(pdf_path, storage_key) if storage_key else None

    record = DocumentRecord(
        logical_name=logical_name,
        version=version,
        original_filename=maybe_encrypt(filename),
        storage_key=storage_key,
        pdf_path=str(pdf_path),
        status="uploaded",
        is_active=False,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    create_processing_log(db, "document", "uploaded", f"{filename} 업로드 완료", document_id=record.id)

    try:
        record.status = "parsing"
        db.commit()
        create_processing_log(db, "document", "parsing", "PDF 파싱 시작", document_id=record.id)
        generated_md_path = await convert_pdf_to_md(pdf_path)

        managed_md_path = MANAGED_DOCS_DIR / f"{logical_name}_v{version}.md"
        managed_md_path.write_text(generated_md_path.read_text(encoding="utf-8"), encoding="utf-8")
        safe_unlink(str(generated_md_path))

        record.md_path = str(managed_md_path)
        record.parser_type = "markdown"
        create_processing_log(db, "document", "parsing", "PDF 파싱 성공", document_id=record.id)

        record.status = "embedding"
        db.commit()
        create_processing_log(db, "document", "embedding", "chunk/embedding 생성 시작", document_id=record.id)

        rag = get_rag_service()
        markdown = managed_md_path.read_text(encoding="utf-8")
        chunks = rag.build_chunks_for_markdown(
            markdown,
            {
                "file": logical_name,
                "title": filename,
                "category": "document",
                "document_id": record.id,
                "source_type": "document",
            },
        )
        rag.replace_document_chunks(db, record.id, chunks)

        json_path = MANAGED_JSON_DIR / f"{logical_name}_v{version}.json"
        json_payload = {
            "document_id": record.id,
            "logical_name": logical_name,
            "version": version,
            "original_filename": filename,
            "status": "ready",
            "chunk_count": len(chunks),
        }
        json_path.write_text(json.dumps(json_payload, ensure_ascii=False, indent=2), encoding="utf-8")

        chunk_path = MANAGED_CHUNKS_DIR / f"{logical_name}_v{version}.json"
        chunk_payload = [
            {"index": index, "content": chunk.page_content, "metadata": chunk.metadata}
            for index, chunk in enumerate(chunks)
        ]
        chunk_path.write_text(json.dumps(chunk_payload, ensure_ascii=False, indent=2), encoding="utf-8")

        embedding_path = MANAGED_EMBEDDINGS_DIR / f"{logical_name}_v{version}.json"
        embedding_payload = {
            "document_id": record.id,
            "embedding_model": get_settings().embedding_model,
            "strategy": "full_rebuild",
            "chunk_count": len(chunks),
        }
        embedding_path.write_text(json.dumps(embedding_payload, ensure_ascii=False, indent=2), encoding="utf-8")

        record.json_path = str(json_path)
        record.chunk_path = str(chunk_path)
        record.embedding_path = str(embedding_path)

        old_records = (
            db.query(DocumentRecord)
            .filter(
                DocumentRecord.logical_name == logical_name,
                DocumentRecord.id != record.id,
                DocumentRecord.is_active.is_(True),
            )
            .all()
        )
        for old in old_records:
            delete_document_assets(db, old)

        record.is_active = True
        record.status = "ready"
        record.error_message = None
        db.commit()
        rag.index_all(db)
        create_processing_log(db, "document", "ready", "문서 활성화 완료", document_id=record.id)
        db.refresh(record)
        return record
    except Exception as exc:
        record.status = "failed"
        record.error_message = maybe_encrypt(str(exc))
        db.commit()
        create_processing_log(db, "document", "failed", "문서 처리 실패", document_id=record.id, detail=str(exc))
        raise


def delete_document_assets(db: Session, record: DocumentRecord) -> None:
    safe_unlink(record.pdf_path)
    safe_unlink(record.md_path)
    safe_unlink(record.json_path)
    safe_unlink(record.chunk_path)
    safe_unlink(record.embedding_path)
    delete_s3_key(record.storage_key)

    record.is_active = False
    record.status = "deleted"
    db.query(ProcessingLog).filter(ProcessingLog.document_id == record.id).delete(synchronize_session=False)
    db.commit()


def hard_delete_document(db: Session, record: DocumentRecord) -> None:
    delete_document_assets(db, record)
    db.delete(record)
    db.commit()
    get_rag_service().index_all(db)


def retry_document_processing(db: Session, record: DocumentRecord) -> DocumentRecord:
    if not record.pdf_path:
        raise ValueError("원본 PDF 경로가 없습니다.")
    pdf_path = Path(record.pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError("원본 PDF 파일을 찾을 수 없습니다.")

    record.status = "uploaded"
    record.error_message = None
    db.commit()
    return record


def full_reindex(db: Session) -> None:
    seed_faqs(db)
    sync_faqs_to_file(db)
    get_rag_service().index_all(db)


def upsert_faqs(db: Session, payload: list[dict]) -> None:
    existing = {row.faq_key: row for row in db.query(FaqRecord).all()}
    seen_keys: set[str] = set()
    for index, item in enumerate(payload, start=1):
        faq_key = item.get("id") or f"faq_{index:03d}"
        seen_keys.add(faq_key)
        row = existing.get(faq_key)
        values = {
            "category": item.get("category", ""),
            "question": item.get("question", ""),
            "answer": item.get("answer", ""),
            "keywords_json": json.dumps(item.get("keywords", []), ensure_ascii=False),
            "aliases_json": json.dumps(item.get("aliases", []), ensure_ascii=False),
            "search_hints_json": json.dumps(item.get("search_hints", []), ensure_ascii=False),
            "source_files_json": json.dumps(item.get("source_files", []), ensure_ascii=False),
            "direct_answer": bool(item.get("direct_answer", False)),
            "top_k": int(item.get("top_k", 4) or 4),
            "is_active": True,
        }
        if row:
            for key, value in values.items():
                setattr(row, key, value)
        else:
            db.add(FaqRecord(faq_key=faq_key, **values))

    for faq_key, row in existing.items():
        if faq_key not in seen_keys:
            row.is_active = False

    db.commit()
    sync_faqs_to_file(db)
    full_reindex(db)
