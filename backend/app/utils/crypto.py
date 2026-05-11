from cryptography.fernet import Fernet
from app.config import get_settings


def get_fernet() -> Fernet:
    """ENCRYPTION_KEY는 `Fernet.generate_key()`로 생성한 URL-safe base64 키여야 합니다."""
    settings = get_settings()
    return Fernet(settings.encryption_key.encode())


def encrypt(plain_text: str) -> str:
    """평문 문자열을 암호화하여 반환"""
    if not plain_text:
        return ""
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt(cipher_text: str) -> str:
    """암호화된 문자열을 복호화하여 반환"""
    if not cipher_text:
        return ""
    f = get_fernet()
    return f.decrypt(cipher_text.encode()).decode()
