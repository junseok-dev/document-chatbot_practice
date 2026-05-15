from __future__ import annotations

import shutil
from pathlib import Path

from app.config import get_settings

try:
    import boto3
except ImportError:  # pragma: no cover
    boto3 = None


ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = ROOT / "data"
PDF_DIR = DATA_DIR / "pdfs"
MANAGED_DOCS_DIR = DATA_DIR / "managed_docs"
MANAGED_JSON_DIR = DATA_DIR / "managed_json"
MANAGED_CHUNKS_DIR = DATA_DIR / "managed_chunks"
MANAGED_EMBEDDINGS_DIR = DATA_DIR / "managed_embeddings"
FAISS_DIR = DATA_DIR / "faiss_index"

_FAISS_FILES = ("index.faiss", "index.pkl")


def _get_s3_client():
    settings = get_settings()
    if not settings.aws_s3_bucket or boto3 is None:
        return None, None
    session = boto3.session.Session(
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
        region_name=settings.aws_region or None,
    )
    return session.client("s3"), settings


def upload_faiss_to_s3() -> None:
    client, settings = _get_s3_client()
    if client is None:
        return
    prefix = f"{settings.aws_s3_prefix.rstrip('/')}/faiss"
    for filename in _FAISS_FILES:
        local_path = FAISS_DIR / filename
        if local_path.exists():
            client.upload_file(str(local_path), settings.aws_s3_bucket, f"{prefix}/{filename}")


def download_faiss_from_s3() -> bool:
    client, settings = _get_s3_client()
    if client is None:
        return False
    FAISS_DIR.mkdir(parents=True, exist_ok=True)
    prefix = f"{settings.aws_s3_prefix.rstrip('/')}/faiss"
    downloaded = False
    for filename in _FAISS_FILES:
        local_path = FAISS_DIR / filename
        try:
            client.download_file(settings.aws_s3_bucket, f"{prefix}/{filename}", str(local_path))
            downloaded = True
        except Exception:
            pass
    return downloaded


def ensure_storage_dirs() -> None:
    for directory in (
        PDF_DIR,
        MANAGED_DOCS_DIR,
        MANAGED_JSON_DIR,
        MANAGED_CHUNKS_DIR,
        MANAGED_EMBEDDINGS_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)


def upload_file_to_s3(local_path: Path, storage_key: str) -> str | None:
    client, settings = _get_s3_client()
    if client is None:
        return None
    client.upload_file(str(local_path), settings.aws_s3_bucket, storage_key)
    return storage_key


def delete_s3_key(storage_key: str | None) -> None:
    if not storage_key:
        return
    client, settings = _get_s3_client()
    if client is None:
        return
    client.delete_object(Bucket=settings.aws_s3_bucket, Key=storage_key)


def safe_unlink(path_value: str | None) -> None:
    if not path_value:
        return
    path = Path(path_value)
    if path.exists() and path.is_file():
        path.unlink()


def safe_rmtree(path_value: str | None) -> None:
    if not path_value:
        return
    path = Path(path_value)
    if path.exists() and path.is_dir():
        shutil.rmtree(path)
