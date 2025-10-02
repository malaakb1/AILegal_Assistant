# services/classifier.py
from __future__ import annotations
import os, json, re
from typing import Optional, TypedDict
from openai import AzureOpenAI
from services.ocr import extract_text_any

_client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
)
DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt35-legal-dev")

MAIN_BUCKETS = {
    "cases": {"sub": ["family","labor","civil","criminal","commercial","administrative","real_estate","enforcement","medical_malpractice","inheritance"]},
    "contracts": {"sub": ["employment","sales","lease","nda","service","real_estate","partnership","government","other"]},
    "consultations": {"sub": ["legal_opinion","memo","advice","business","family","labor","criminal"]},
    "correspondence": {"sub": ["client","court","government","internal","external"]},
    "memos": {"sub": ["internal","external","court_memo","legal_memo","case_summary","research_note"]},
    "reports": {"sub": ["expert_report","audit","summary_report","financial","investigation","compliance"]},
}

# كلمات مفتاحية بسيطة لتوجيه سريع عند فشل OCR
FAMILY_HINTS = ["طلاق","خلع","حضانة","نفقة","زيارة","ولاية","محضون","مطلق","مطلقة"]
LABOR_HINTS  = ["عمل","عمال","رواتب","مكافأة","انذار","انهاء خدمة"]
CRIM_HINTS   = ["جنائي","جناية","جنحة","حيازة","تعاطي","سرقة","قتل"]
REAL_HINTS   = ["عقار","عقاري","إيجار","ملكية","تمليك","بيع","شراء","رهن","أرض"]
ENF_HINTS    = ["تنفيذ","ايقاف خدمات","حجز","سداد","شيك","كمبيالة"]

class Classification(TypedDict):
    bucket: str
    subfolder: Optional[str]
    confidence: float
    reasoning: str

SYSTEM_PROMPT = f"""
أنت مصنف مستندات قانونية عربية.
أعد JSON فقط بالمفاتيح: bucket, subfolder, confidence, reasoning.
القوائم:
- buckets: {list(MAIN_BUCKETS.keys())}
- subfolders: { {k: v["sub"] for k,v in MAIN_BUCKETS.items()} }
التزم بـ JSON صالح فقط.
"""

def _heuristic_bucket(filename: str, text: str) -> tuple[str, Optional[str], float, str]:
    """تخمين سريع عند نقص النص."""
    hint_src = filename + " " + text[:500]
    def has_any(words): 
        return any(w in hint_src for w in words)

    if has_any(FAMILY_HINTS):
        return ("cases","family",0.65,"توجيه بالاعتماد على كلمات أحوال شخصية (مثال: طلاق/نفقة/حضانة).")
    if has_any(ENF_HINTS):
        return ("cases","enforcement",0.6,"توجيه بالاعتماد على كلمات تنفيذ/إيقاف خدمات.")
    if has_any(LABOR_HINTS):
        return ("cases","labor",0.6,"توجيه بالاعتماد على كلمات عمالية.")
    if has_any(REAL_HINTS):
        return ("cases","real_estate",0.55,"توجيه بالاعتماد على مفردات عقارية/إيجار.")
    if has_any(CRIM_HINTS):
        return ("cases","criminal",0.55,"توجيه بالاعتماد على ألفاظ جنائية.")
    return ("reports","summary_report",0.3,"فشل OCR/نص قليل؛ توجيه افتراضي لتقارير.")

def classify_bytes(file_bytes: bytes, filename: str) -> Classification:
    # 1) OCR للنص
    text = extract_text_any(filename, file_bytes)
    text_short = (text or "").strip()

    # 1.أ لو النص ضعيف جدًا → heuristics على اسم الملف/القليل الموجود
    if len(text_short) < 80:
        bucket, sub, conf, why = _heuristic_bucket(filename, text_short)
        return {"bucket":bucket,"subfolder":sub,"confidence":conf,"reasoning":why}

    # 2) تصنيف عبر Azure OpenAI مع تمرير اسم الملف كإشارة
    user_prompt = f"صنّف المستند التالي (اسم الملف: {filename}):\n---\n{text_short[:18000]}\n---"
    resp = _client.chat.completions.create(
        model=DEPLOYMENT,
        temperature=0.1,
        response_format={"type":"json_object"},
        messages=[
            {"role":"system","content":SYSTEM_PROMPT},
            {"role":"user","content":user_prompt}
        ],
        max_tokens=500,
    )
    data = json.loads(resp.choices[0].message.content)

    bucket = data.get("bucket","reports")
    sub    = data.get("subfolder")
    conf   = float(data.get("confidence",0.55))
    why    = data.get("reasoning","")

    # ضبط القيم غير الصالحة
    if bucket not in MAIN_BUCKETS:
        bucket, sub, conf, why = _heuristic_bucket(filename, text_short)
    elif sub and sub not in MAIN_BUCKETS[bucket]["sub"]:
        sub = MAIN_BUCKETS[bucket]["sub"][0] if MAIN_BUCKETS[bucket]["sub"] else None

    return {"bucket":bucket,"subfolder":sub,"confidence":conf,"reasoning":why}
