# backend/api/file_routes.py
from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from services.storage import (
    save_temp,
    move_from_inbox_to_path,
    ensure_container,          # نتأكد أن الكونتينر موجود قبل النقل
)
from services.classifier import classify_bytes  # OCR (Gemini) + تصنيف (Azure OpenAI)

router = APIRouter(prefix="/files", tags=["Files"])


@router.post(
    "/classify-upload",
    summary="Upload → OCR (Gemini) → Classify → Route in Blob",
)
async def classify_upload(file: UploadFile = File(...)):
    """
    1) يرفع الملف مؤقتًا إلى inbox.
    2) OCR + تصنيف بالموديلات (Gemini للـ OCR و Azure OpenAI للتصنيف).
    3) يحدد الكونتينر الرئيسي (bucket) ثم المجلد الفرعي (subfolder) ويحرّك الملف مباشرةً:
       inbox → <bucket>/<subfolder>/<filename>
       لو الثقة منخفضة، يذهب إلى: unclassified/<filename>
    """
    # --- 1) رفع مؤقت إلى inbox ---
    content = await file.read()
    temp_blob_name = save_temp(content, file.filename, container="inbox")

    # --- 2) OCR + تصنيف ---
    result = classify_bytes(content, file.filename)
    bucket = result.get("bucket")            # الكونتينر الرئيسي (cases / contracts / …)
    sub    = result.get("subfolder")         # المجلد الفرعي داخل الحاوية
    conf   = float(result.get("confidence", 0.0))

    # --- 3) تحديد الوجهة النهائية ---
    if conf < 0.35:
        # ثقة منخفضة → نرسلها إلى unclassified
        dst_container = "unclassified"
        dst_blob_name = file.filename
    else:
        dst_container = bucket or "unclassified"
        dst_blob_name = f"{sub}/{file.filename}" if sub else file.filename

    # تأكد من وجود الكونتينر الوجهة
    ensure_container(dst_container)

    # --- 4) النقل: من inbox إلى الوجهة النهائية مباشرةً (بدون المرور على sorted) ---
    try:
        move_from_inbox_to_path(
            temp_blob_name=temp_blob_name,
            dst_blob_path=dst_blob_name,
            dst_container=dst_container,
        )
    except Exception as e:
        # فشل النقل → بلّغي بخطأ داخلي
        raise HTTPException(status_code=500, detail=f"Routing failed: {e}")

    # --- 5) استجابة واضحة ---
    return JSONResponse(
        {
            "ok": True,
            "inbox_blob": f"inbox/{temp_blob_name}",
            "moved_to": f"{dst_container}/{dst_blob_name}",
            "ai_decision": result,  # {bucket, subfolder, confidence, reasoning}
        }
    )
