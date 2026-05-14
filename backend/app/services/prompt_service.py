from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.database import SessionLocal
from app.db.models import PromptConfig


PROMPT_DEFAULTS = {
    "counseling_prompt": ("상담 prompt", "default_counseling_prompt"),
    "cancel_prompt": ("취소 prompt", "default_cancel_prompt"),
    "fallback_prompt": ("fallback prompt", "default_fallback_prompt"),
    "handoff_prompt": ("문의 유도 prompt", "default_handoff_prompt"),
}


def seed_prompt_configs(db: Session) -> None:
    settings = get_settings()
    for prompt_key, (label, attr_name) in PROMPT_DEFAULTS.items():
        existing = db.query(PromptConfig).filter(PromptConfig.prompt_key == prompt_key).first()
        if existing:
            continue
        db.add(
            PromptConfig(
                prompt_key=prompt_key,
                label=label,
                content=getattr(settings, attr_name),
            )
        )
    db.commit()


def update_counseling_prompt(db: Session) -> None:
    settings = get_settings()
    record = db.query(PromptConfig).filter(PromptConfig.prompt_key == "counseling_prompt").first()
    if record:
        record.content = settings.default_counseling_prompt
        db.commit()


def _get_prompt_value(db: Session, prompt_key: str) -> str:
    seed_prompt_configs(db)
    prompt = db.query(PromptConfig).filter(PromptConfig.prompt_key == prompt_key).first()
    return prompt.content if prompt else ""


def get_prompt_value(prompt_key: str) -> str:
    db = SessionLocal()
    try:
        return _get_prompt_value(db, prompt_key)
    finally:
        db.close()
