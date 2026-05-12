import asyncio
import platform
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
import pytesseract
from openai import OpenAI

if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = (
        r"C:\Users\Playdata\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"
    )

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DOCS_DIR = ROOT / "data" / "docs"

_executor = ThreadPoolExecutor(max_workers=2)


def _extract_pdf_text(pdf_path: Path) -> str:
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            parts = []

            text = page.extract_text()
            if text and text.strip():
                parts.append(text.strip())

            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                rows = []
                for i, row in enumerate(table):
                    cells = [str(c).strip() if c else "" for c in row]
                    rows.append("| " + " | ".join(cells) + " |")
                    if i == 0:
                        rows.append("| " + " | ".join(["---"] * len(row)) + " |")
                parts.append("\n".join(rows))

            if parts:
                pages.append("\n\n".join(parts))

    return "\n\n---\n\n".join(pages)


def _ocr_pdf(pdf_path: Path) -> str:
    doc = pdfium.PdfDocument(str(pdf_path))
    pages_text = []
    for i in range(len(doc)):
        page = doc[i]
        bitmap = page.render(scale=3)
        pil_image = bitmap.to_pil()
        text = pytesseract.image_to_string(pil_image, lang="kor+eng")
        if text.strip():
            pages_text.append(text.strip())
    return "\n\n".join(pages_text)


def _structure_as_markdown(raw_text: str, api_key: str) -> str:
    client = OpenAI(api_key=api_key)

    # 긴 문서는 청크로 나눠 처리
    max_chars = 12000
    if len(raw_text) <= max_chars:
        chunks = [raw_text]
    else:
        chunks = [raw_text[i:i + max_chars] for i in range(0, len(raw_text), max_chars)]

    results = []
    for chunk in chunks:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "PDF에서 추출한 텍스트를 Markdown 형식으로 정리해주세요. "
                        "원본 내용을 빠짐없이 유지하면서 헤딩(#, ##), 리스트, 표를 적절히 사용해주세요. "
                        "페이지 번호, 머리글, 바닥글처럼 반복되는 불필요한 내용만 제거하세요. "
                        "내용을 요약하거나 생략하지 마세요."
                    ),
                },
                {"role": "user", "content": chunk},
            ],
            max_tokens=8000,
        )
        results.append(response.choices[0].message.content.strip())

    return "\n\n".join(results)


def _pdf_to_md_filename(pdf_name: str) -> str:
    stem = Path(pdf_name).stem
    safe = re.sub(r"[^\w가-힣]", "_", stem)
    return f"{safe}.md"


def _convert_sync(pdf_path: Path, api_key: str) -> Path:
    raw_text = _extract_pdf_text(pdf_path)
    if not raw_text.strip():
        raw_text = _ocr_pdf(pdf_path)
    if not raw_text.strip():
        raise ValueError(f"텍스트 추출 실패: {pdf_path.name}")

    md_content = _structure_as_markdown(raw_text, api_key)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    md_path = DOCS_DIR / _pdf_to_md_filename(pdf_path.name)
    md_path.write_text(md_content, encoding="utf-8")
    return md_path


async def convert_pdf_to_md(pdf_path: Path, api_key: str) -> Path:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _convert_sync, pdf_path, api_key)
