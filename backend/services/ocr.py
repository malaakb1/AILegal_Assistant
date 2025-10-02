# services/ocr.py
from __future__ import annotations
import os, io, logging, mimetypes, tempfile
from typing import Optional
from dotenv import load_dotenv

# اختياري: استخراج نص PDF/DOCX كـ fallback سريع
try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None

try:
    import docx  # python-docx
except Exception:
    docx = None

import google.generativeai as genai
from google.generativeai import GenerativeModel, upload_file, delete_file
from google.api_core import exceptions as gex

load_dotenv()
logger = logging.getLogger(__name__)

_API_KEY = os.getenv("GOOGLE_API_KEY")
if not _API_KEY:
    raise RuntimeError("GOOGLE_API_KEY is missing from .env")
genai.configure(api_key=_API_KEY)

_MODEL_PRIMARY  = os.getenv("GEMINI_MODEL",   "gemini-2.5-pro").strip()
_MODEL_FALLBACK = os.getenv("GEMINI_FALLBACK","gemini-2.5-flash").strip()

def _make_model(name: str) -> GenerativeModel:
    return genai.GenerativeModel(name)

_GEN_CFG = {"temperature": 0.0, "max_output_tokens": 8192}

_OCR_PROMPT = (
    "أنت خبير OCR. استخرج النص كما يظهر، دون شرح أو تلخيص، كنص عادي (plain text). "
    "اقرأ كل الصفحات إن كان PDF/صورة."
)

def _guess_mime(filename: str) -> str:
    t, _ = mimetypes.guess_type(filename)
    return t or "application/octet-stream"

def _basic_pdf_text(bytes_data: bytes) -> str:
    """محاولة سريعة لاستخراج نص PDF عبر PyPDF2 قبل الذهاب لـ OCR."""
    if not PdfReader:
        return ""
    try:
        from io import BytesIO
        r = PdfReader(BytesIO(bytes_data))
        parts = []
        for pg in r.pages:
            try:
                parts.append(pg.extract_text() or "")
            except Exception:
                pass
        return "\n".join(parts).strip()
    except Exception:
        return ""

def _basic_docx_text(bytes_data: bytes) -> str:
    if not docx:
        return ""
    try:
        from io import BytesIO
        d = docx.Document(BytesIO(bytes_data))
        return "\n".join(p.text for p in d.paragraphs).strip()
    except Exception:
        return ""

def _upload_any_compat(filename: str, data: bytes, mime: str):
    """
    يرفع الملف إلى File API بتوافقية:
    - يحاول upload_file(file=BytesIO(...))
    - وإن فشل (TypeError في النسخ القديمة) يكتب ملف مؤقت ويستخدم path=
    """
    try:
        return upload_file(file=io.BytesIO(data), display_name=filename, mime_type=mime)
    except TypeError:
        # نسخة قديمة لا تدعم 'file='
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            return upload_file(path=tmp_path, display_name=filename, mime_type=mime)
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

def _run_gemini_ocr(model_name: str, filename: str, data: bytes) -> str:
    mime = _guess_mime(filename)
    up = None
    try:
        up = _upload_any_compat(filename, data, mime)
        model = _make_model(model_name)
        resp = model.generate_content([_OCR_PROMPT, up], generation_config=_GEN_CFG)
        return (getattr(resp, "text", "") or "").strip()
    finally:
        try:
            if up is not None:
                delete_file(up.name)
        except Exception:
            pass

def extract_text_any(filename: str, file_bytes: bytes) -> str:
    """
    1) جرّب استخراج بسيط من PDF/DOCX محليًا (لو كفى نرجعه).
    2) جرّب Gemini بالموديل الأساسي؛ وإن فشل جرّب الـ fallback.
    """
    lower = filename.lower()

    # محلي سريع (قد يكفي ويغني عن OCR في كثير من الملفات)
    if lower.endswith(".pdf"):
        txt = _basic_pdf_text(file_bytes)
        if len(txt) > 120:
            return txt
    elif lower.endswith(".docx"):
        txt = _basic_docx_text(file_bytes)
        if len(txt) > 60:
            return txt

    # OCR عبر Gemini
    try:
        return _run_gemini_ocr(_MODEL_PRIMARY, filename, file_bytes)
    except gex.NotFound as e:
        logger.warning("Primary model %s not found/supported: %s", _MODEL_PRIMARY, e)
    except Exception as e:
        logger.warning("Primary model %s failed: %s", _MODEL_PRIMARY, e)

    try:
        return _run_gemini_ocr(_MODEL_FALLBACK, filename, file_bytes)
    except Exception as e:
        logger.error("Fallback model %s failed: %s", _MODEL_FALLBACK, e)
        return ""
