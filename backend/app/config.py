from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ""
    model_name: str = "gpt-5-mini"
    embedding_model: str = "text-embedding-3-small"
    encryption_key: str = ""
    admin_password: str = "admin1234"
    database_url: str = "sqlite:///./chatbot.db"

    aws_region: str = "ap-northeast-2"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_s3_prefix: str = "document-chatbot"

    channel_talk_url: str = ""

    default_counseling_prompt: str = Field(
        default=(
            "당신은 플레이데이터 교육 상담 문서를 기반으로 답변하는 RAG 상담사입니다.\n"
            "문서와 FAQ에 근거한 내용만 답하고, 근거가 없으면 추측하지 말고 관리자 확인이 필요하다고 안내하세요.\n"
            "답변은 한국어로, 간결하고 직접적으로 작성하세요."
        )
    )
    default_cancel_prompt: str = Field(
        default=(
            "수강 취소, 환불, 일정 변경 같은 요청은 상담 매니저 확인이 필요합니다. "
            "아래 채널톡 버튼으로 연결해 주세요."
        )
    )
    default_fallback_prompt: str = Field(
        default=(
            "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. "
            "계속 문제가 있으면 관리자 또는 상담 채널로 문의해 주세요."
        )
    )
    default_handoff_prompt: str = Field(
        default=(
            "정확한 확인이 필요합니다. 아래 채널톡 버튼으로 상담 매니저와 연결해 주세요."
        )
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
