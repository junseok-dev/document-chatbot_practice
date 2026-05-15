import io
import json
from datetime import date, datetime, time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.crud import get_all_sessions, get_session_messages
from app.db.database import get_db
from app.db.models import AdminAuditLog, ChatLog, ChatSession, DocumentRecord, FaqRecord, ProcessingLog, PromptConfig
from app.models.session import MessageDetail, SessionDetail, SessionSummary
from app.services.admin_service import (
    approve_document,
    create_audit_log,
    full_reindex,
    process_catalog_import,
    process_uploaded_faq_md,
    process_uploaded_md,
    process_uploaded_pdf,
    reject_document,
    restore_document,
    soft_delete_document,
)
from app.services.faq_service import _serialize_faq, seed_faqs, sync_faqs_to_file
from app.services.prompt_service import PROMPT_DEFAULTS, seed_prompt_configs, serialize_prompt
from app.utils.crypto import decrypt_if_needed, encrypt, maybe_encrypt

router = APIRouter()

ENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / "backend" / ".env"
PROTECTED_PROMPTS = set(PROMPT_DEFAULTS.keys())


def verify_admin(x_admin_password: str = Header(...)):
    if x_admin_password != get_settings().admin_password:
        raise HTTPException(status_code=401, detail="관리자 인증에 실패했습니다.")


class PasswordChangeRequest(BaseModel):
    new_password: str


class ReviewRequest(BaseModel):
    note: str | None = None


class FaqItemPayload(BaseModel):
    id: str
    category: str
    question: str
    answer: str
    keywords: list[str] = []
    aliases: list[str] = []
    search_hints: list[str] = []
    source_files: list[str] = []
    direct_answer: bool = False
    top_k: int = 4


class PromptPayload(BaseModel):
    prompt_key: str
    label: str
    content: str


def _serialize_document(record: DocumentRecord) -> dict:
    return {
        "id": record.id,
        "logical_name": record.logical_name,
        "version": record.version,
        "original_filename": decrypt_if_needed(record.original_filename) or "",
        "status": record.status,
        "parser_type": record.parser_type,
        "is_active": record.is_active,
        "is_deleted": getattr(record, "is_deleted", False),
        "review_note": decrypt_if_needed(getattr(record, "review_note", None)),
        "approved_at": getattr(record, "approved_at", None),
        "rejected_at": getattr(record, "rejected_at", None),
        "deleted_at": getattr(record, "deleted_at", None),
        "error_message": decrypt_if_needed(record.error_message),
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "has_md": bool(record.md_path and Path(record.md_path).exists()),
        "has_json": bool(record.json_path and Path(record.json_path).exists()),
        "has_pdf": bool(record.pdf_path and Path(record.pdf_path).exists()),
    }


def _read_optional_text(path_value: str | None) -> str | None:
    if not path_value:
        return None
    path = Path(path_value)
    if not path.exists() or not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def _serialize_processing_log(row: ProcessingLog) -> dict:
    return {
        "id": row.id,
        "document_id": row.document_id,
        "log_type": row.log_type,
        "status": row.status,
        "message": decrypt_if_needed(row.message) or "",
        "detail": decrypt_if_needed(row.detail),
        "created_at": row.created_at,
    }


def _serialize_chat_log(row: ChatLog) -> dict:
    retrieval_chunks = decrypt_if_needed(row.retrieval_chunks) or "[]"
    return {
        "id": row.id,
        "session_id": row.session_id,
        "question": decrypt_if_needed(row.question) or "",
        "retrieval_chunks": json.loads(retrieval_chunks or "[]"),
        "answer": decrypt_if_needed(row.answer) or "",
        "source": row.source,
        "error": decrypt_if_needed(row.error),
        "processing_status": row.processing_status,
        "embedding_cost": row.embedding_cost,
        "llm_cost": row.llm_cost,
        "created_at": row.created_at,
    }


def _serialize_audit_log(row: AdminAuditLog) -> dict:
    return {
        "id": row.id,
        "actor": row.actor,
        "action": row.action,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "detail": decrypt_if_needed(row.detail),
        "created_at": row.created_at,
    }


def _upsert_faq_row(db: Session, payload: FaqItemPayload) -> FaqRecord:
    row = db.query(FaqRecord).filter(FaqRecord.faq_key == payload.id).first()
    values = {
        "category": maybe_encrypt(payload.category),
        "question": maybe_encrypt(payload.question),
        "answer": maybe_encrypt(payload.answer),
        "keywords_json": maybe_encrypt(json.dumps(payload.keywords, ensure_ascii=False)),
        "aliases_json": maybe_encrypt(json.dumps(payload.aliases, ensure_ascii=False)),
        "search_hints_json": maybe_encrypt(json.dumps(payload.search_hints, ensure_ascii=False)),
        "source_files_json": maybe_encrypt(json.dumps(payload.source_files, ensure_ascii=False)),
        "direct_answer": payload.direct_answer,
        "top_k": payload.top_k,
        "is_active": True,
    }
    if row:
        for key, value in values.items():
            setattr(row, key, value)
    else:
        row = FaqRecord(faq_key=payload.id, **values)
        db.add(row)
    db.commit()
    db.refresh(row)
    create_audit_log(db, "faq_saved", "faq", payload.id, payload.question)
    return row


def _build_workbook(rows: list[dict]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "chat_logs"
    sheet.append(["session_id", "question", "answer", "source", "processing_status", "embedding_cost", "llm_cost", "created_at"])
    for row in rows:
        sheet.append(
            [
                row["session_id"],
                row["question"],
                row["answer"],
                row["source"],
                row["processing_status"],
                row["embedding_cost"],
                row["llm_cost"],
                row["created_at"].isoformat() if row["created_at"] else "",
            ]
        )
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def _filter_chat_logs(db: Session, start_date: date | None = None, end_date: date | None = None, session_id: str | None = None) -> list[ChatLog]:
    query = db.query(ChatLog)
    if start_date:
        query = query.filter(ChatLog.created_at >= datetime.combine(start_date, time.min))
    if end_date:
        query = query.filter(ChatLog.created_at <= datetime.combine(end_date, time.max))
    if session_id:
        query = query.filter(ChatLog.session_id == session_id)
    return query.order_by(ChatLog.created_at.desc()).all()


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    sessions = get_all_sessions(db, skip=skip, limit=limit)
    result = []
    for session in sessions:
        summary = SessionSummary.model_validate(session)
        summary.user_name = decrypt_if_needed(session.encrypted_user_name) if session.encrypted_user_name else None
        result.append(summary)
    return result


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session_detail(session_id: str, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    messages = get_session_messages(db, session_id)
    summary = SessionSummary.model_validate(session)
    summary.user_name = decrypt_if_needed(session.encrypted_user_name) if session.encrypted_user_name else None
    decrypted_messages = []
    for message in messages:
        detail = MessageDetail.model_validate(message)
        detail.content = decrypt_if_needed(message.content) or ""
        decrypted_messages.append(detail)
    return SessionDetail(session=summary, messages=decrypted_messages)


@router.post("/upload-md")
async def upload_md(file: UploadFile = File(...), title: str = Form(None), category: str = Form(None), db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if not file.filename or not file.filename.lower().endswith(".md"):
        raise HTTPException(status_code=400, detail="MD 파일만 업로드할 수 있습니다.")
    record = await process_uploaded_md(db, file.filename, await file.read(), title=title, category=category)
    return {"message": "MD 업로드 후 검토 대기 상태로 저장했습니다.", "document": _serialize_document(record)}


@router.post("/upload-faq-md")
async def upload_faq_md(file: UploadFile = File(...), category: str = Form(None), db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if not file.filename or not file.filename.lower().endswith(".md"):
        raise HTTPException(status_code=400, detail="MD 파일만 업로드할 수 있습니다.")
    record, faq_items = await process_uploaded_faq_md(db, file.filename, await file.read(), category=category)
    return {
        "message": "FAQ 변환 결과를 생성했고, 아직 운영 반영 전입니다.",
        "document": _serialize_document(record),
        "faqs": faq_items,
    }


@router.post("/import-catalog")
async def import_catalog(catalog: UploadFile = File(...), files: list[UploadFile] = File(...), db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if not catalog.filename or not catalog.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="catalog는 JSON 파일이어야 합니다.")
    catalog_data = json.loads(await catalog.read())
    md_files = {f.filename: await f.read() for f in files if f.filename and f.filename.lower().endswith(".md")}
    records = await process_catalog_import(db, catalog_data, md_files)
    return {"message": f"{len(records)}개 문서를 검토 대기 상태로 가져왔습니다.", "documents": [_serialize_document(r) for r in records]}


@router.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...), db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")
    record = await process_uploaded_pdf(db, file.filename, await file.read())
    return {"message": "PDF 업로드와 MD 변환이 완료되었고, 현재 검토 대기 상태입니다.", "document": _serialize_document(record)}


@router.get("/documents")
def list_documents(
    parser_type: str | None = Query(default=None),
    include_deleted: bool = Query(default=False),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    query = db.query(DocumentRecord).order_by(DocumentRecord.created_at.desc())
    if parser_type:
        query = query.filter(DocumentRecord.parser_type == parser_type)
    if not include_deleted:
        query = query.filter(DocumentRecord.is_deleted.is_(False))
    if status:
        query = query.filter(DocumentRecord.status == status)
    return {"documents": [_serialize_document(row) for row in query.all()]}


@router.get("/documents/{document_id}")
def get_document_detail(document_id: int, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return {"document": _serialize_document(record), "md_content": _read_optional_text(record.md_path), "json_content": _read_optional_text(record.json_path)}


@router.post("/documents/{document_id}/approve")
def approve_document_route(document_id: int, body: ReviewRequest, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    updated = approve_document(db, record, body.note)
    return {"message": "문서를 승인해 운영 데이터에 반영했습니다.", "document": _serialize_document(updated)}


@router.post("/documents/{document_id}/reject")
def reject_document_route(document_id: int, body: ReviewRequest, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    updated = reject_document(db, record, body.note)
    return {"message": "문서를 반려했습니다.", "document": _serialize_document(updated)}


@router.post("/documents/{document_id}/restore")
def restore_document_route(document_id: int, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    updated = restore_document(db, record)
    return {"message": "문서를 복구해 다시 검토 대기 상태로 돌렸습니다.", "document": _serialize_document(updated)}


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, note: str | None = Query(default=None), db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    updated = soft_delete_document(db, record, note)
    return {"message": "문서를 삭제 처리했습니다.", "document": _serialize_document(updated)}


@router.post("/documents/{document_id}/retry")
def retry_document(document_id: int, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    if record.status != "failed":
        return {"message": "현재 문서는 재처리 대상이 아닙니다."}
    return {"message": "재처리는 같은 파일을 다시 업로드하는 방식으로 진행합니다."}


@router.post("/reindex")
def reindex(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    full_reindex(db)
    create_audit_log(db, "reindex", "system", "global", "full_rebuild")
    return {"message": "전체 인덱스를 다시 생성했습니다.", "strategy": "full_rebuild"}


@router.get("/faqs")
def get_faqs(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    seed_faqs(db)
    rows = db.query(FaqRecord).filter(FaqRecord.is_active.is_(True)).order_by(FaqRecord.id.asc()).all()
    return {"faqs": [_serialize_faq(row) for row in rows]}


@router.post("/faqs")
def create_faq(body: FaqItemPayload, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    row = _upsert_faq_row(db, body)
    sync_faqs_to_file(db)
    full_reindex(db)
    return {"message": "FAQ를 추가했습니다.", "faq": _serialize_faq(row)}


@router.put("/faqs/{faq_key}")
def update_faq(faq_key: str, body: FaqItemPayload, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if faq_key != body.id:
        raise HTTPException(status_code=400, detail="FAQ 키가 일치하지 않습니다.")
    row = _upsert_faq_row(db, body)
    sync_faqs_to_file(db)
    full_reindex(db)
    return {"message": "FAQ를 수정했습니다.", "faq": _serialize_faq(row)}


@router.delete("/faqs/{faq_key}")
def delete_faq(faq_key: str, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    row = db.query(FaqRecord).filter(FaqRecord.faq_key == faq_key).first()
    if not row:
        raise HTTPException(status_code=404, detail="FAQ를 찾을 수 없습니다.")
    row.is_active = False
    db.commit()
    sync_faqs_to_file(db)
    full_reindex(db)
    create_audit_log(db, "faq_deleted", "faq", faq_key)
    return {"message": "FAQ를 삭제했습니다."}


@router.get("/prompts")
def get_prompts(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    seed_prompt_configs(db)
    prompts = db.query(PromptConfig).order_by(PromptConfig.id.asc()).all()
    return {"prompts": [serialize_prompt(row) for row in prompts]}


@router.post("/prompts")
def create_prompt(body: PromptPayload, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    existing = db.query(PromptConfig).filter(PromptConfig.prompt_key == body.prompt_key).first()
    if existing:
        raise HTTPException(status_code=409, detail="같은 키의 프롬프트가 이미 있습니다.")
    row = PromptConfig(prompt_key=body.prompt_key, label=body.label, content=encrypt(body.content))
    db.add(row)
    db.commit()
    db.refresh(row)
    create_audit_log(db, "prompt_created", "prompt", body.prompt_key, body.label)
    return {"message": "프롬프트를 추가했습니다.", "prompt": serialize_prompt(row)}


@router.put("/prompts/{prompt_key}")
def update_prompt(prompt_key: str, body: PromptPayload, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if prompt_key != body.prompt_key:
        raise HTTPException(status_code=400, detail="프롬프트 키가 일치하지 않습니다.")
    row = db.query(PromptConfig).filter(PromptConfig.prompt_key == prompt_key).first()
    if not row:
        raise HTTPException(status_code=404, detail="프롬프트를 찾을 수 없습니다.")
    row.label = body.label
    row.content = encrypt(body.content)
    db.commit()
    db.refresh(row)
    create_audit_log(db, "prompt_updated", "prompt", body.prompt_key, body.label)
    return {"message": "프롬프트를 수정했습니다.", "prompt": serialize_prompt(row)}


@router.delete("/prompts/{prompt_key}")
def delete_prompt(prompt_key: str, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if prompt_key in PROTECTED_PROMPTS:
        raise HTTPException(status_code=400, detail="기본 시스템 프롬프트는 삭제할 수 없습니다.")
    row = db.query(PromptConfig).filter(PromptConfig.prompt_key == prompt_key).first()
    if not row:
        raise HTTPException(status_code=404, detail="프롬프트를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    create_audit_log(db, "prompt_deleted", "prompt", prompt_key)
    return {"message": "프롬프트를 삭제했습니다."}


@router.get("/logs")
def get_logs(limit: int = 100, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    processing_logs = db.query(ProcessingLog).order_by(ProcessingLog.created_at.desc()).limit(limit).all()
    chat_logs = db.query(ChatLog).order_by(ChatLog.created_at.desc()).limit(limit).all()
    audit_logs = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit).all()
    return {
        "processing_logs": [_serialize_processing_log(row) for row in processing_logs],
        "chat_logs": [_serialize_chat_log(row) for row in chat_logs],
        "audit_logs": [_serialize_audit_log(row) for row in audit_logs],
    }


@router.get("/audit-logs")
def get_audit_logs(limit: int = 100, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    rows = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit).all()
    return {"audit_logs": [_serialize_audit_log(row) for row in rows]}


@router.get("/chat-logs")
def list_chat_logs(start_date: date | None = None, end_date: date | None = None, session_id: str | None = None, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    rows = _filter_chat_logs(db, start_date=start_date, end_date=end_date, session_id=session_id)
    return {"chat_logs": [_serialize_chat_log(row) for row in rows]}


@router.get("/chat-logs/export")
def export_chat_logs(start_date: date | None = None, end_date: date | None = None, session_id: str | None = None, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    rows = [_serialize_chat_log(row) for row in _filter_chat_logs(db, start_date=start_date, end_date=end_date, session_id=session_id)]
    payload = _build_workbook(rows)
    filename = f"chat_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("/password")
def change_password(body: PasswordChangeRequest, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    if not body.new_password or len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="비밀번호는 4자 이상이어야 합니다.")
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    updated = [line for line in lines if not line.startswith("ADMIN_PASSWORD=")]
    updated.append(f"ADMIN_PASSWORD={body.new_password}")
    ENV_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    get_settings.cache_clear()
    create_audit_log(db, "password_changed", "system", "admin_password")
    return {"message": "비밀번호를 변경했습니다."}
