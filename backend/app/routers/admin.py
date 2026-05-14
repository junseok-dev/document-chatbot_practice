import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.crud import get_all_sessions, get_session_messages
from app.db.database import get_db
from app.db.models import ChatLog, ChatSession, DocumentRecord, FaqRecord, ProcessingLog, PromptConfig
from app.models.session import MessageDetail, SessionDetail, SessionSummary
from app.services.admin_service import (
    full_reindex,
    hard_delete_document,
    process_catalog_import,
    process_uploaded_md,
    process_uploaded_pdf,
    upsert_faqs,
)
from app.services.faq_service import seed_faqs
from app.services.prompt_service import seed_prompt_configs
from app.utils.crypto import decrypt

router = APIRouter()

ENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / "backend" / ".env"


def verify_admin(x_admin_password: str = Header(...)):
    if x_admin_password != get_settings().admin_password:
        raise HTTPException(status_code=401, detail="관리자 인증에 실패했습니다.")


class PasswordChangeRequest(BaseModel):
    new_password: str


class FaqUpdateRequest(BaseModel):
    faqs: list[dict]


class PromptUpdateItem(BaseModel):
    prompt_key: str
    content: str


class PromptUpdateRequest(BaseModel):
    prompts: list[PromptUpdateItem]


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    sessions = get_all_sessions(db, skip=skip, limit=limit)
    result = []
    for session in sessions:
        summary = SessionSummary.model_validate(session)
        summary.user_name = decrypt(session.encrypted_user_name) if session.encrypted_user_name else None
        result.append(summary)
    return result


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session_detail(session_id: str, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    messages = get_session_messages(db, session_id)
    summary = SessionSummary.model_validate(session)
    summary.user_name = decrypt(session.encrypted_user_name) if session.encrypted_user_name else None
    decrypted_messages = []
    for message in messages:
        detail = MessageDetail.model_validate(message)
        detail.content = decrypt(message.content) if message.content else ""
        decrypted_messages.append(detail)
    return SessionDetail(session=summary, messages=decrypted_messages)


@router.post("/upload-md")
async def upload_md(
    file: UploadFile = File(...),
    title: str = Form(None),
    category: str = Form(None),
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    if not file.filename or not file.filename.lower().endswith(".md"):
        raise HTTPException(status_code=400, detail="MD 파일만 업로드할 수 있습니다.")
    try:
        record = await process_uploaded_md(db, file.filename, await file.read(), title=title, category=category)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "message": "MD 업로드와 색인이 완료되었습니다.",
        "document_id": record.id,
        "logical_name": record.logical_name,
        "status": record.status,
    }


@router.post("/import-catalog")
async def import_catalog(
    catalog: UploadFile = File(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    if not catalog.filename or not catalog.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="catalog는 JSON 파일이어야 합니다.")
    try:
        catalog_data = json.loads(await catalog.read())
        md_files = {
            f.filename: await f.read()
            for f in files
            if f.filename and f.filename.lower().endswith(".md")
        }
        records = await process_catalog_import(db, catalog_data, md_files)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "message": f"{len(records)}개 문서를 가져왔습니다.",
        "documents": [
            {"id": r.id, "logical_name": r.logical_name, "status": r.status}
            for r in records
        ],
    }


@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")

    try:
        record = await process_uploaded_pdf(db, file.filename, await file.read())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "message": "업로드와 색인이 완료되었습니다.",
        "document_id": record.id,
        "status": record.status,
    }


@router.get("/documents")
def list_documents(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    documents = (
        db.query(DocumentRecord)
        .order_by(DocumentRecord.created_at.desc())
        .all()
    )
    return {
        "documents": [
            {
                "id": row.id,
                "logical_name": row.logical_name,
                "version": row.version,
                "original_filename": row.original_filename,
                "status": row.status,
                "is_active": row.is_active,
                "error_message": row.error_message,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            for row in documents
        ]
    }


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    hard_delete_document(db, record)
    return {"message": "문서를 삭제했습니다."}


@router.post("/documents/{document_id}/retry")
def retry_document(document_id: int, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    record = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    if not record.pdf_path or not Path(record.pdf_path).exists():
        raise HTTPException(status_code=400, detail="재처리에 필요한 원본 PDF가 없습니다.")
    return {"message": "현재 버전은 새 업로드로 재처리하는 구조입니다. 동일 파일을 다시 업로드해 주세요."}


@router.post("/reindex")
def reindex(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    full_reindex(db)
    return {"message": "전체 재색인을 완료했습니다.", "strategy": "full_rebuild"}


@router.get("/faqs")
def get_faqs(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    seed_faqs(db)
    faqs = db.query(FaqRecord).filter(FaqRecord.is_active.is_(True)).order_by(FaqRecord.id.asc()).all()
    return {
        "faqs": [
            {
                "id": row.faq_key,
                "category": row.category,
                "question": row.question,
                "answer": row.answer,
                "keywords": json.loads(row.keywords_json or "[]"),
                "aliases": json.loads(row.aliases_json or "[]"),
                "search_hints": json.loads(row.search_hints_json or "[]"),
                "source_files": json.loads(row.source_files_json or "[]"),
                "direct_answer": row.direct_answer,
                "top_k": row.top_k,
            }
            for row in faqs
        ]
    }


@router.put("/faqs")
def update_faqs(body: FaqUpdateRequest, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    upsert_faqs(db, body.faqs)
    return {"message": "FAQ를 저장하고 재색인했습니다."}


@router.get("/prompts")
def get_prompts(db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    seed_prompt_configs(db)
    prompts = db.query(PromptConfig).order_by(PromptConfig.id.asc()).all()
    return {
        "prompts": [
            {
                "prompt_key": row.prompt_key,
                "label": row.label,
                "content": row.content,
                "updated_at": row.updated_at,
            }
            for row in prompts
        ]
    }


@router.put("/prompts")
def update_prompts(body: PromptUpdateRequest, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    seed_prompt_configs(db)
    for item in body.prompts:
        prompt = db.query(PromptConfig).filter(PromptConfig.prompt_key == item.prompt_key).first()
        if prompt:
            prompt.content = item.content
    db.commit()
    return {"message": "Prompt 설정을 저장했습니다."}


@router.get("/logs")
def get_logs(limit: int = 100, db: Session = Depends(get_db), _: None = Depends(verify_admin)):
    processing_logs = (
        db.query(ProcessingLog)
        .order_by(ProcessingLog.created_at.desc())
        .limit(limit)
        .all()
    )
    chat_logs = (
        db.query(ChatLog)
        .order_by(ChatLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "processing_logs": [
            {
                "id": row.id,
                "document_id": row.document_id,
                "log_type": row.log_type,
                "status": row.status,
                "message": row.message,
                "detail": row.detail,
                "created_at": row.created_at,
            }
            for row in processing_logs
        ],
        "chat_logs": [
            {
                "id": row.id,
                "session_id": row.session_id,
                "question": row.question,
                "retrieval_chunks": json.loads(row.retrieval_chunks or "[]"),
                "answer": row.answer,
                "source": row.source,
                "error": row.error,
                "processing_status": row.processing_status,
                "embedding_cost": row.embedding_cost,
                "llm_cost": row.llm_cost,
                "created_at": row.created_at,
            }
            for row in chat_logs
        ],
    }


@router.put("/password")
def change_password(body: PasswordChangeRequest, _: None = Depends(verify_admin)):
    if not body.new_password or len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="비밀번호는 4자 이상이어야 합니다.")

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    updated = [line for line in lines if not line.startswith("ADMIN_PASSWORD=")]
    updated.append(f"ADMIN_PASSWORD={body.new_password}")
    ENV_PATH.write_text("\n".join(updated) + "\n", encoding="utf-8")
    get_settings.cache_clear()
    return {"message": "비밀번호를 변경했습니다."}
