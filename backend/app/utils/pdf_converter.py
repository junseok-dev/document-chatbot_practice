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
            text = page.extract_text()
            if text and text.strip():
                pages.append(text.strip())
    return "\n\n".join(pages)


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
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "PDF에서 추출한 텍스트를 Markdown 형식으로 정리해주세요. "
                    "원본 내용을 그대로 유지하면서 헤딩(#, ##), 리스트, 표를 적절히 사용해주세요. "
                    "페이지 번호, 머리글, 바닥글처럼 반복되는 불필요한 내용은 제거해주세요."
                ),
            },
            {"role": "user", "content": raw_text},
        ],
        max_tokens=4000,
    )
    return response.choices[0].message.content.strip()


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
