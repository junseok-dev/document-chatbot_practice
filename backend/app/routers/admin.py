from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.crud import get_all_sessions, get_session_messages
from app.models.session import SessionSummary, SessionDetail, MessageDetail
from app.config import get_settings
from app.utils.crypto import decrypt
from app.utils.pdf_converter import convert_pdf_to_md

PDF_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "pdfs"

router = APIRouter()


def verify_admin(x_admin_password: str = Header(...)):
    """관리자 비밀번호 헤더 검증"""
    settings = get_settings()
    if x_admin_password != settings.admin_password:
        raise HTTPException(status_code=401, detail="관리자 인증에 실패했습니다.")


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    """상담 세션 목록 조회 (관리자 전용)"""
    sessions = get_all_sessions(db, skip=skip, limit=limit)
    result = []
    for s in sessions:
        summary = SessionSummary.model_validate(s)
        summary.user_name = decrypt(s.encrypted_user_name) if s.encrypted_user_name else None
        result.append(summary)
    return result


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session_detail(
    session_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(verify_admin),
):
    """특정 세션의 전체 메시지 상세 조회 (관리자 전용)"""
    from app.db.models import ChatSession

    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    messages = get_session_messages(db, session_id)
    summary = SessionSummary.model_validate(session)
    summary.user_name = decrypt(session.encrypted_user_name) if session.encrypted_user_name else None
    decrypted_messages = []
    for m in messages:
        detail = MessageDetail.model_validate(m)
        detail.content = decrypt(m.content) if m.content else ''
        decrypted_messages.append(detail)
    return SessionDetail(session=summary, messages=decrypted_messages)


@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    _: None = Depends(verify_admin),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = PDF_DIR / file.filename
    pdf_path.write_bytes(await file.read())

    settings = get_settings()
    md_path = await convert_pdf_to_md(pdf_path, settings.openai_api_key)

    import asyncio
    from app.services.rag_service import get_rag_service
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, get_rag_service().index_all)

    return {"message": "변환 완료. 챗봇에 즉시 반영되었습니다.", "md_file": md_path.name}
