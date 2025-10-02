# services/storage.py
from __future__ import annotations

import os
import mimetypes
import uuid
from typing import Optional

from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core.exceptions import ResourceExistsError
from dotenv import load_dotenv

load_dotenv()

# =========[ 1) التهيئة: إنشاء عميل التخزين ]=========
CONN_STR    = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
ACCOUNT     = os.getenv("AZURE_STORAGE_ACCOUNT")
ACCOUNT_KEY = os.getenv("AZURE_STORAGE_KEY")

if CONN_STR:
    _blob_service = BlobServiceClient.from_connection_string(CONN_STR)
elif ACCOUNT and ACCOUNT_KEY:
    _blob_service = BlobServiceClient(
        account_url=f"https://{ACCOUNT}.blob.core.windows.net",
        credential=ACCOUNT_KEY,
    )
else:
    raise RuntimeError(
        "Azure Storage credentials not found. "
        "Set AZURE_STORAGE_CONNECTION_STRING OR (AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_KEY) in .env"
    )

# =========[ 2) أسماء الكونتينرات من .env (مع قيم افتراضية) ]=========
CONTAINER_INBOX        = os.getenv("AZ_BLOB_INBOX", "inbox")
CONTAINER_SORTED       = os.getenv("AZ_BLOB_SORTED", "sorted")              # اختياري إن أردتِ الإبقاء عليه
CONTAINER_LEGISLATION  = os.getenv("AZ_BLOB_LEGISLATION", "legislation")
CONTAINER_UNCLASSIFIED = os.getenv("AZ_BLOB_UNCLASSIFIED", "unclassified")  # جديد

REQUIRED_CONTAINERS = [
    CONTAINER_INBOX,
    CONTAINER_SORTED,
    CONTAINER_LEGISLATION,
    CONTAINER_UNCLASSIFIED,
]

# =========[ 3) دوال مساعدة ]=========
def ensure_container(name: str) -> None:
    """ينشئ الكونتينر إذا لم يكن موجودًا. لا يرمي خطأ إن كان موجود."""
    try:
        _blob_service.create_container(name)
    except ResourceExistsError:
        pass

def get_container_client(name: str):
    return _blob_service.get_container_client(name)

def _guess_content_type(filename: str) -> str:
    ctype, _ = mimetypes.guess_type(filename)
    return ctype or "application/octet-stream"

def upload_bytes(
    container: str,
    blob_name: str,
    data: bytes,
    content_type: Optional[str] = None,
) -> str:
    """
    يرفع بايتات إلى Blob باسم blob_name داخل الكونتينر المحدد.
    يعيد مسار الـ blob (لأغراض اللوج/التتبع).
    """
    ensure_container(container)
    cc = get_container_client(container)
    if content_type is None:
        content_type = _guess_content_type(blob_name)
    cs = ContentSettings(content_type=content_type)
    cc.upload_blob(name=blob_name, data=data, overwrite=True, content_settings=cs)
    return f"{container}/{blob_name}"

def copy_within_account(src_container: str, src_blob: str, dst_container: str, dst_blob: str) -> None:
    """
    ينسخ Blob داخل نفس الحساب.
    ملاحظة: المجلدات في Blob هي مجرد بادئات أسماء (virtual folders).
    """
    ensure_container(dst_container)
    src_client = get_container_client(src_container).get_blob_client(src_blob)
    dst_client = get_container_client(dst_container).get_blob_client(dst_blob)
    src_url = src_client.url
    dst_client.start_copy_from_url(src_url)

def delete_blob(container: str, blob_name: str) -> None:
    get_container_client(container).delete_blob(blob_name, delete_snapshots="include")

# =========[ 4) إنشاء الكونتينرات المطلوبة عند تحميل الموديول ]=========
for c in REQUIRED_CONTAINERS:
    ensure_container(c)

# =========[ 5) واجهات سهلة الاستعمال للكود الآخر ]=========
def _unique_name(original_filename: str) -> str:
    """يولّد اسمًا فريدًا بسيطًا لتفادي التصادم (اختياري)."""
    base = original_filename.strip().replace("\\", "/").split("/")[-1]
    uid = uuid.uuid4().hex[:8]
    return f"{uid}_{base}"

def save_temp(
    content: bytes,
    filename: str,
    container: str = CONTAINER_INBOX,
    keep_original_name: bool = True,
) -> str:
    """
    يحفظ ملف مؤقت (مثلاً المرفوع للتصنيف) داخل inbox.
    يرجع اسم الـ blob (بدون الدليل الكامل للحساب).
    """
    blob_name = filename if keep_original_name else _unique_name(filename)
    upload_bytes(container, blob_name, content)
    return blob_name

def move_from_inbox_to_path(
    temp_blob_name: str,
    dst_blob_path: str,
    dst_container: str = CONTAINER_SORTED,  # بإمكانك تمرير أي كونتينر نهائي، مثل: cases/..., contracts/... الخ
) -> None:
    """
    يحرك blob من inbox إلى مسار وجهة (داخل كونتينر آخر أو نفس الكونتينر).
    أسهل طريقة: نقرأ ثم نرفع ثم نحذف.
    """
    inbox_cc   = get_container_client(CONTAINER_INBOX)
    src_client = inbox_cc.get_blob_client(temp_blob_name)
    data       = src_client.download_blob().readall()

    upload_bytes(dst_container, dst_blob_path, data)
    delete_blob(CONTAINER_INBOX, temp_blob_name)
