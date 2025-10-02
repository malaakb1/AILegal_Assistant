# services/deepsearch.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import json
import time
import logging
import datetime
from typing import Any, Dict, List, Tuple, Optional, Iterable, Set

import httpx
import tldextract

# 1) Gemini SDK
try:
    import google.generativeai as genai
    from google.generativeai import types as gemtypes
except Exception:  # pragma: no cover
    genai = None
    gemtypes = None

# 2) .env (اختياري لكن مفيد)
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

logger = logging.getLogger(__name__)

# ----------------- الإعدادات (بيئة) -----------------
# مفاتيح Gemini
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")  # اسم الكي كما طلبت
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK", "gemini-1.5-flash")

# وضع JSON الصارم (نتركه للمكالمات بدون Grounding فقط)
GEMINI_JSON_ONLY = os.getenv("GEMINI_JSON_ONLY", "1").lower() in {"1", "true", "yes", "on"}
# إيقاف الحماية (اختياري)
GEMINI_SAFETY_OFF = os.getenv("GEMINI_SAFETY_OFF", "0").lower() in {"1", "true", "yes", "on"}

# تمكين توسيع ثنائي اللغة بالترجمة عبر Gemini قبل البحث (اختياري)
# إن كان 1 سيجري استدعاء خفيف لGemini لاستخراج كلمات إنجليزية من الموضوع
GEMINI_QTRANSLATE = os.getenv("GEMINI_QTRANSLATE", "0").lower() in {"1", "true", "yes", "on"}

# SerpAPI (اختياري كبديل)
SERPAPI_KEY = os.getenv("SERPAPI_KEY")
SERPAPI_DISABLED = os.getenv("SERPAPI_DISABLED", "1").lower() in {"1", "true", "yes", "on"}

# حظر/سماح نطاقات
BLOCKED = [s.strip() for s in (os.getenv("BLOCKED_SITES", "").replace("،", ",").split(",")) if s.strip()]
ALLOWED = [s.strip() for s in (os.getenv("ALLOWED_SITES", "").replace("،", ",").split(",")) if s.strip()]

# ----------------- أدوات مساعدة -----------------
def _host(url: str) -> str:
    t = tldextract.extract(url)
    return f"{t.domain}.{t.suffix}" if t.suffix else t.domain

def _allowed(url: str) -> bool:
    h = _host(url)
    if any(b for b in BLOCKED if b and b in h):
        return False
    if ALLOWED:
        return any(a for a in ALLOWED if a and a in h)
    return True

def _to_str(x: Any) -> str:
    if x is None:
        return ""
    if isinstance(x, (int, float)):
        return str(x)
    if isinstance(x, str):
        return x
    if isinstance(x, (list, tuple, set)):
        return ", ".join([_to_str(v).strip() for v in x if _to_str(v).strip()])
    try:
        return json.dumps(x, ensure_ascii=False)
    except Exception:
        return str(x)

def _parse_sources_list(s: str) -> List[str]:
    if not s:
        return []
    return [p.strip() for p in s.replace("،", ",").split(",") if p.strip()]

_STOPWORDS = {
    "،", ",", "هذا", "هذه", "ذلك", "تكون", "يكون", "على", "في", "من", "عن", "إلى", "التي",
    "الذي", "الذين", "مع", "قد", "وقد", "هو", "هي", "او", "أو", "بين", "كما", "ما", "ولا",
    "لم", "لن", "كان", "وكان", "داخل", "خارج",
    # عامّة قانونية غير مفيدة للاستعلام
    "قانون", "قانونية", "نظام", "أنظمة", "لأحكام", "أحكام", "حكومي", "حكومية", "جهة",
    "عام", "النص", "المادة", "مواد", "تنظيم", "منظم", "المنظمة", "اللائحة", "اللوائح",
    # إنجليزية شائعة
    "and", "or", "the", "a", "of", "for", "to", "by",
}
_AR_PREFIXES = ("وال", "فال", "بال", "كال", "لل", "ال", "و")

def _strip_prefixes(tok: str) -> str:
    t = tok
    changed = True
    while changed:
        changed = False
        for p in _AR_PREFIXES:
            if t.startswith(p) and len(t) > len(p) + 1:
                t = t[len(p):]
                changed = True
    return t

def _norm_token(tok: str) -> str:
    t = tok.strip().lower()
    t = re.sub(r"[^\w\u0600-\u06FF]+", "", t)
    return _strip_prefixes(t)

def _keywords(text: str, top_k: int = 8) -> List[str]:
    tokens = re.findall(r"[\w\u0600-\u06FF]+", text or "")
    freq: Dict[str, int] = {}
    for t in tokens:
        nt = _norm_token(t)
        if len(nt) < 3 or nt in _STOPWORDS:
            continue
        freq[nt] = freq.get(nt, 0) + 1
    ordered = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    return [w for (w, c) in ordered[:top_k]]

def _normalize_answers(scope: Dict[str, Any]) -> Dict[str, str]:
    law_subject = _to_str(scope.get("law_subject")).strip() or "موضوع قانون غير محدد"
    geo = _to_str(scope.get("geo") or scope.get("geography")).strip() or "جميع دول العالم"
    timeframe = _to_str(scope.get("timeframe")).strip() or "آخر 10 سنوات"
    subject_refine = _to_str(scope.get("subject_refine") or scope.get("subject")).strip()
    sources = _to_str(scope.get("sources") or "جميع المصادر")
    return {
        "law_subject": law_subject,
        "geo": geo,
        "timeframe": timeframe,
        "sources": sources,
        "subject_refine": subject_refine,
    }

def deepsearch_questions(_model_unused: Any, base_article: Dict[str, Any]) -> Dict[str, Any]:
    article_title = (base_article.get("article_title") or "").strip()
    prefill = {
        "law_subject": "",
        "geo": "جميع دول العالم",
        "timeframe": "آخر 10 سنوات",
        "sources": "تشريعات، معايير دولية، بحوث",
        "subject_refine": article_title or "",
    }
    questions = [
        {"id": "law_subject", "label": "ما هو موضوع القانون الرئيسي؟ (إلزامي)", "type": "input", "placeholder": "مثال: حماية البيانات، المنافسة، المشتريات..."},
        {"id": "subject_refine", "label": "ما هو الموضوع الدقيق لهذه المادة؟ (اختياري)", "type": "input", "placeholder": "مثال: التعريفات، نطاق التطبيق، الجزاءات..."},
        {"id": "geo", "label": "ما النطاق الجغرافي؟", "type": "input", "placeholder": "الإمارات، الاتحاد الأوروبي..."},
        {"id": "timeframe", "label": "ما الإطار الزمني؟", "type": "input", "placeholder": "آخر 5/10/20 سنة..."},
        {"id": "sources", "label": "ما نوع المصادر المطلوبة؟", "type": "textarea", "placeholder": "تشريعات، سوابق، معايير، بحوث..."},
    ]
    return {"article_title": article_title, "questions": questions, "prefill": prefill}

# ----------------- نطاقات مفضلة حسب نوع المصدر -----------------
def _domain_filter_from_sources(sources: str) -> str:
    toks = [t.lower() for t in _parse_sources_list(sources)] or [sources.lower()]
    parts: List[str] = []

    def add(s: str):
        s = s.strip()
        if s and s not in parts:
            parts.append(s)

    default_sites = (
        "(site:.gov OR site:.go.ae OR site:.gov.ae OR site:.gov.uk OR site:.gouv OR site:.europa.eu "
        "OR site:uaelegislation.gov.ae OR site:legislation.gov.uk OR site:eur-lex.europa.eu "
        "OR site:uncitral.un.org OR site:oecd.org OR site:worldbank.org OR site:un.org OR site:ilo.org OR site:wipo.int "
        "OR site:.edu OR site:.ac.uk OR site:.ac.ae OR site:jstor.org OR site:heinonline.org OR site:ssrn.com)"
    )
    if any("جميع" in t or "all" in t for t in toks):
        return default_sites
    if any(t in ("تشريعات", "قوانين", "لوائح", "regulations", "laws") for t in toks):
        add("(site:.gov OR site:.go.ae OR site:.gov.ae OR site:uaelegislation.gov.ae OR site:.gov.uk OR site:legislation.gov.uk OR site:.gouv OR site:eur-lex.europa.eu)")
    if any(t in ("سوابق", "أحكام", "cases", "jurisprudence") for t in toks):
        add("(site:courts.gov OR site:judiciary.* OR site:supremecourt.*)")
    if any(t in ("معايير", "standards", "نماذج", "model") for t in toks):
        add("(site:uncitral.un.org OR site:oecd.org OR site:worldbank.org OR site:un.org OR site:ilo.org OR site:wipo.int)")
    if any(t in ("بحوث", "أكاديمية", "research") for t in toks):
        add("(site:.edu OR site:.ac.uk OR site:.ac.ae OR site:jstor.org OR site:heinonline.org OR site:ssrn.com)")
    if any(t in ("أخبار", "news") for t in toks):
        add("(site:reuters.com OR site:bloomberg.com OR site:wam.ae OR site:news.gov)")
    return "(" + " OR ".join(parts) + ")" if parts else default_sites

def _geo_hint(geo: str) -> Dict[str, Any]:
    g = (geo or "").lower()
    domain_q, gl, lr, hl = "", None, None, "ar"
    def add_sites(s: str):
        nonlocal domain_q
        domain_q = f"({domain_q} OR {s})" if domain_q else f"({s})"
    if not g or "جميع" in g or "global" in g:
        return {"domain_q": "", "gl": gl, "lr": lr, "hl": hl}
    if "إمارات" in g or "uae" in g:
        add_sites("site:uaelegislation.gov.ae OR site:.go.ae OR site:.gov.ae OR site:.ae")
        gl, lr = "ae", "lang_ar"
    elif "الاتحاد الأوروبي" in g or "eu" in g:
        add_sites("site:eur-lex.europa.eu OR site:europa.eu")
        gl, lr, hl = "be", "lang_en", "en"
    elif "المملكة المتحدة" in g or "uk" in g:
        add_sites("site:legislation.gov.uk OR site:.gov.uk")
        gl, lr, hl = "uk", "lang_en", "en"
    elif "الولايات المتحدة" in g or "usa" in g or "us" in g:
        add_sites("site:.gov")
        gl, lr, hl = "us", "lang_en", "en"
    return {"domain_q": domain_q, "gl": gl, "lr": lr, "hl": hl}

def _parse_timeframe_to_tbs(timeframe: str) -> Optional[str]:
    if not timeframe:
        return None
    s = timeframe.strip()
    today = datetime.date.today()
    def mmddyyyy(d: datetime.date) -> str:
        return d.strftime("%m/%d/%Y")
    m = re.search(r"آخر\s+(\d+)\s*(?:سنة|سنوات)", s)
    if m:
        start = datetime.date(today.year - int(m.group(1)), 1, 1)
        return f"cdr:1,cd_min:{mmddyyyy(start)},cd_max:{mmddyyyy(today)}"
    m = re.search(r"منذ\s+(\d{4})", s)
    if m:
        start = datetime.date(int(m.group(1)), 1, 1)
        return f"cdr:1,cd_min:{mmddyyyy(start)},cd_max:{mmddyyyy(today)}"
    return None

# ----------------- توسيع ثنائي اللغة (عام وغير مقيّد) -----------------
# قاموس مصغر عام لمجالات شائعة (اختياري، غير مُقيّد لقانون معيّن)
_AR_EN_GLOSSARY = {
    "منافسة": "competition",
    "حماية البيانات": "data protection privacy",
    "بيانات": "data",
    "خصوصية": "privacy",
    "مستهلك": "consumer protection",
    "المشتريات": "public procurement purchasing tenders",
    "عقود": "contracts",
    "شركات": "companies corporate",
    "عمل": "labor employment",
    "إفلاس": "bankruptcy insolvency",
    "تحكيم": "arbitration",
    "جرائم إلكترونية": "cybercrime",
    "أمن سيبراني": "cybersecurity",
    "أموال غير مشروعة": "anti-money laundering AML CFT",
    "أوراق مالية": "securities capital markets",
    "ملكية فكرية": "intellectual property IP patents trademarks copyright",
    "بيئة": "environmental",
    "ضرائب": "tax VAT",
    "جمارك": "customs",
    "اتصالات": "telecommunications",
    "إعلام": "media",
    "صحة": "health",
    "تعليم": "education",
    "مكافحة الاحتكار": "antitrust competition",
    "شراكة": "public-private partnership PPP",
    "شراكات": "public-private partnership PPP",
}

def _guess_english_keywords_ar(text: str) -> List[str]:
    """يستخرج مرادفات إنجليزية عامة من قاموس بسيط بدون تخصيص لقانون محدد."""
    out: Set[str] = set()
    for ar, en in _AR_EN_GLOSSARY.items():
        if ar in text:
            out.update(en.split())
            out.add(en)  # العبارة المركبة أيضًا
    return list(out)[:12]

def _translate_quick_with_gemini(prompt_text: str) -> List[str]:
    """ترجمة/تلخيص كلمات مفتاحية إلى إنجليزية عبر Gemini (اختياري)."""
    if not (genai and GEMINI_API_KEY and GEMINI_QTRANSLATE):
        return []
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_FALLBACK_MODEL or "gemini-1.5-flash")
        instr = (
            "Translate/extract 5-10 concise English keywords (comma-separated) capturing the legal topic. "
            "Return ONLY the comma-separated keywords."
        )
        resp = model.generate_content([instr + "\n\nText:\n" + prompt_text], request_options={"timeout": 30})
        text = getattr(resp, "text", "") or ""
        if not text:
            return []
        # split by comma/newline
        parts = re.split(r"[,;\n]+", text)
        kws = [p.strip() for p in parts if p.strip()]
        # فلترة بسيطة
        kws = [re.sub(r"[^A-Za-z0-9\- ]+", "", k) for k in kws]
        kws = [k for k in kws if len(k) >= 2]
        return list(dict.fromkeys(kws))[:12]
    except Exception as e:
        logger.warning(f"Gemini quick translate failed: {e}")
        return []

def _bilingual_expansion(law_subject: str, subject_refine: str, base_text: str) -> List[str]:
    """توسيع موضوع البحث إلى بدائل إنجليزية عامة دون تخصيص لقانون معين."""
    seed = " ".join([law_subject or "", subject_refine or ""]).strip()
    seeds = [seed] if seed else []
    # كلمات من نص المادة
    base_kws = _keywords(base_text, top_k=6)
    if base_kws:
        seeds.append(" ".join(base_kws))
    # قاموس عام
    en1 = _guess_english_keywords_ar(seed + " " + " ".join(base_kws))
    # ترجمة اختيارية عبر Gemini
    en2 = _translate_quick_with_gemini(seed) if seed else []
    variants: List[str] = []
    for s in seeds:
        s = s.strip()
        if s:
            variants.append(s)  # عربي
    # أضف الإنجليزية دون تكرار
    for k in en1 + en2:
        if k and k not in variants:
            variants.append(k)
    # قص القائمة
    return variants[:10]

# ----------------- بناء الاستعلامات (عام وغير مقيّد) -----------------
def _build_queries(base: Dict[str, Any], scope: Dict[str, Any]) -> List[str]:
    ans = _normalize_answers(scope)
    law_subject = ans["law_subject"]
    subject_refine = ans["subject_refine"]
    base_text = (base.get("article_text") or "").strip()

    domain_filter = _domain_filter_from_sources(ans["sources"])
    geo_hint = _geo_hint(ans["geo"])
    geo_q = f" {geo_hint['domain_q']} " if geo_hint["domain_q"] else ""

    # إطار زمني مبسط (after:YYYY) لنتائج حديثة
    timeframe_hint = ""
    if "آخر 5" in ans["timeframe"]:
        timeframe_hint = f" after:{datetime.date.today().year - 5}"
    elif "آخر 10" in ans["timeframe"]:
        timeframe_hint = f" after:{datetime.date.today().year - 10}"
    elif "آخر 20" in ans["timeframe"]:
        timeframe_hint = f" after:{datetime.date.today().year - 20}"

    # توسيع ثنائي اللغة **عام** (لا يقيّد لنوع قانون محدد)
    expanded_terms = _bilingual_expansion(law_subject, subject_refine, base_text)
    # كلمات دلالية من النص
    kws = _keywords(base_text, top_k=5)
    kws_str = " ".join([f'"{k}"' for k in kws])

    queries: List[str] = []

    # Q1: عربي/إنجليزي + كلمات دلالية + نطاقات
    for term in expanded_terms[:4]:  # لا نبالغ
        q = " ".join(filter(None, [f'"{term}"' if " " in term else term, kws_str, domain_filter, geo_q, timeframe_hint]))
        queries.append(re.sub(r"\s+", " ", q).strip())

    # Q2: موضوع فقط (بدون نطاقات) لتوسيع الالتقاط
    for term in expanded_terms[:3]:
        q = " ".join(filter(None, [f'"{term}"' if " " in term else term, kws_str]))
        queries.append(re.sub(r"\s+", " ", q).strip())

    # Q3: أفضل الممارسات/نماذج/معايير (عام)
    q3 = " ".join(filter(None, [
        '("best practices" OR "model law" OR "international standards" OR framework OR guideline)',
        domain_filter, geo_q, timeframe_hint
    ]))
    queries.append(re.sub(r"\s+", " ", q3).strip())

    # Q4: أخبار/تحليلات (عام)
    q4 = " ".join(filter(None, [
        '(news OR analysis OR developments OR review)', domain_filter, geo_q, timeframe_hint
    ]))
    queries.append(re.sub(r"\s+", " ", q4).strip())

    # إزالة التكرار
    deduped = list(dict.fromkeys([q for q in queries if q]))
    return deduped[:8]

# ----------------- Gemini: إعداد النموذج والاتصال -----------------
def _setup_gemini_model(use_grounding: bool = True):
    if genai is None or gemtypes is None:
        raise RuntimeError("google-generativeai is not installed.")
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY (Gemini) is missing.")

    genai.configure(api_key=GEMINI_API_KEY)

    tools = None
    if use_grounding:
        try:
            tools = [gemtypes.Tool(google_search_retrieval=gemtypes.GoogleSearchRetrieval())]
        except Exception:
            tools = [{"google_search_retrieval": {}}]

    # ⚠️ مهم: لا نستخدم response_mime_type=application/json مع Grounding
    generation_config = {
        "max_output_tokens": 8192,
    }

    safety_settings = None
    if GEMINI_SAFETY_OFF:
        safety_settings = "BLOCK_NONE"

    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        tools=tools,
        generation_config=generation_config,
        safety_settings=safety_settings,
    )
    return model

def _parse_json_only(txt: str) -> Optional[Dict[str, Any]]:
    if not txt:
        return None
    try:
        return json.loads(txt)
    except Exception:
        m = re.search(r"\{[\s\S]*\}$", txt.strip())
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None

def _call_gemini_json(prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """يطلب من Gemini إنتاج JSON (من خلال التوجيهات فقط) مع تفعيل Grounding."""
    last_err: Optional[str] = None
    for attempt in range(1, 3 + 1):
        try:
            model = _setup_gemini_model(use_grounding=True)
            system_hint = "Return STRICT JSON only as described. No markdown, no extra keys."
            contents = [{"role": "user", "parts": [system_hint + "\n\n" + prompt]}]
            resp = model.generate_content(contents, request_options={"timeout": 120})
            text = getattr(resp, "text", None)
            if not text:
                last_err = f"Empty response on attempt {attempt}."
                continue
            data = _parse_json_only(text)
            if data and isinstance(data.get("results"), list):
                return data, None
            last_err = f"Invalid JSON on attempt {attempt}. Snippet: {text[:200]}"
        except Exception as e:
            last_err = f"Gemini API error on attempt {attempt}: {e}"
            logger.error(last_err)
    return None, last_err

# ----------------- ترتيب النتائج وبدائل البحث -----------------
def _dedupe(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    out: List[Dict[str, Any]] = []
    for it in items:
        key = (it.get("title", "").strip().lower(), _host(it.get("url", "")))
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out

def _fallback_search_via_serpapi(
    queries: Iterable[str], per_q: int, geo_hint: Dict[str, Any], tbs: Optional[str],
) -> List[Dict[str, Any]]:
    if SERPAPI_DISABLED or not SERPAPI_KEY:
        return []
    results: List[Dict[str, Any]] = []
    params_common = {
        "engine": "google",
        "hl": geo_hint.get("hl") or "ar",
        "gl": geo_hint.get("gl"),
        "lr": geo_hint.get("lr"),
        "num": per_q,
        "api_key": SERPAPI_KEY,
    }
    if tbs:
        params_common["tbs"] = tbs
    with httpx.Client(timeout=40) as client:
        for q in queries:
            try:
                r = client.get("https://serpapi.com/search.json", params={**params_common, "q": q})
                data = r.json()
                for item in (data.get("organic_results") or []):
                    url = item.get("link") or ""
                    if not url or not _allowed(url):
                        continue
                    results.append({
                        "title": item.get("title") or "",
                        "url": url,
                        "snippet": (item.get("snippet") or item.get("rich_snippet") or ""),
                        "score": float(item.get("position") or 99),
                        "why": "نتيجة بحث احتياطية من Google.",
                    })
            except Exception as e:
                logger.warning(f"SerpAPI call failed for query '{q}': {e}")
                continue
    return _dedupe(results)[:30]

def _rerank_results(results: List[Dict[str, Any]], ans: Dict[str, str], base_title: str, base_text: str) -> List[Dict[str, Any]]:
    if not results:
        return results
    kw = set(_keywords(base_title + " " + base_text, top_k=10))
    if ans.get("subject_refine"):
        kw.update(_keywords(ans["subject_refine"]))
    def score_one(it: Dict[str, Any]) -> float:
        s = 0.0
        h = _host(it.get("url", ""))
        title_snip = (it.get("title") or "") + " " + (it.get("snippet") or "")
        if any(x in h for x in ["uaelegislation.gov.ae", ".go.ae", ".gov.ae", ".gov", "eur-lex.europa.eu", "legislation.gov.uk"]):
            s += 40
        elif any(x in h for x in ["uncitral.un.org", "oecd.org", "worldbank.org", "un.org", "ilo.org", "wipo.int"]):
            s += 35
        elif any(x in h for x in [".edu", ".ac.", "jstor.org", "heinonline.org", "ssrn.com"]):
            s += 25
        toks = set(_keywords(title_snip))
        overlap = len(kw & toks)
        s += overlap * 8.0
        if "نتيجة بحث احتياطية" in (it.get("why") or ""):
            s -= 10
        if ans["law_subject"].lower() in title_snip.lower():
            s += 8
        return s
    ranked = sorted(results, key=score_one, reverse=True)
    return _dedupe(ranked)[:30]

# ----------------- مُنشئ التعليمات لناتج JSON -----------------
def _build_research_prompt(law_subject: str, article_title: str, article_snippet_ar: str) -> str:
    snippet = (article_snippet_ar or "").strip()
    if len(snippet) > 800:
        snippet = snippet[:800] + "..."
    prompt = (
        "أنت باحث قانوني خبير في المقارنات التشريعية.\n\n"
        f"**الموضوع العام:** '{law_subject or 'موضوع المادة'}'\n"
        f"**تركيز المادة:** '{article_title or 'غير متوفر'}' — مقتطف: '{snippet}'\n\n"
        "**المطلوب:**\n"
        "1) أعِد 8–12 مرجعًا عالي الجودة (قوانين، معايير دولية، تقارير موثوقة، تحليلات رسمية).\n"
        "2) لكل مرجع أعد الحقول: title, url, snippet, score, why — حيث why يشرح صلته.\n"
        "3) أعطِ الأولوية للمصادر الحكومية والدولية والأكاديمية.\n\n"
        "**المخرجات:** JSON صارم فقط:\n"
        "{\"results\": [ {\"title\": str, \"url\": str, \"snippet\": str, \"score\": number, \"why\": str} ], \"took_ms\": number }\n"
        "لا تستخدم Markdown أو مفاتيح إضافية."
    )
    return prompt

# ----------------- نقطة الدخول العامة -----------------
def deepsearch_execute(_model_unused: Any, scope: Dict[str, Any]) -> Dict[str, Any]:
    t0 = time.time()
    base = scope.get("base_article") or {}
    if not base:
        return {"queries": [], "results": [], "note": "BASE_ARTICLE_MISSING", "took_ms": 0}

    ans = _normalize_answers(scope)
    if ans["law_subject"] == "موضوع قانون غير محدد":
        # لو أردت جعلها غير إلزامية، يمكنك إزالة هذا الشرط من main.py.
        return {
            "queries": [], "results": [], "note": "MANDATORY_LAW_SUBJECT_MISSING",
            "took_ms": int((time.time() - t0) * 1000),
        }

    base_title = (base.get("article_title") or "").strip()
    base_text = (base.get("article_text") or "").strip()
    queries = _build_queries(base, scope)
    logger.info("استعلامات مُنشأة:\n%s", "\n".join(queries))

    prompt = _build_research_prompt(
        law_subject=ans["law_subject"],
        article_title=base_title,
        article_snippet_ar=base_text,
    )

    note_parts: List[str] = []
    data, err = _call_gemini_json(prompt)
    if err or not data:
        note_parts.append(f"Primary model ({GEMINI_MODEL}) failed: {err}")
        if GEMINI_FALLBACK_MODEL:
            try:
                # إعادة المحاولة مع نموذج السريع/الاحتياطي
                genai.configure(api_key=GEMINI_API_KEY)
                model = genai.GenerativeModel(
                    model_name=GEMINI_FALLBACK_MODEL,
                    tools=[gemtypes.Tool(google_search_retrieval=gemtypes.GoogleSearchRetrieval())] if gemtypes else [{"google_search_retrieval": {}}],
                    generation_config={"max_output_tokens": 8192},
                    safety_settings="BLOCK_NONE" if GEMINI_SAFETY_OFF else None,
                )
                system_hint = "Return STRICT JSON only as described. No markdown, no extra keys."
                resp = model.generate_content(
                    [{"role": "user", "parts": [system_hint + "\n\n" + prompt]}],
                    request_options={"timeout": 120},
                )
                text = getattr(resp, "text", "") or ""
                data = _parse_json_only(text)
                if not (data and isinstance(data.get("results"), list)):
                    note_parts.append(f"Fallback model ({GEMINI_FALLBACK_MODEL}) invalid/empty.")
                    data = None
            except Exception as e:
                note_parts.append(f"Fallback model ({GEMINI_FALLBACK_MODEL}) error: {e}")
                data = None

    took_ms = int((time.time() - t0) * 1000)

    if not data or not isinstance(data, dict) or not data.get("results"):
        fb_note = "GEMINI_FAILED_OR_EMPTY"
        # جرّب SerpAPI إن كان مُفعّلًا
        if not SERPAPI_DISABLED and SERPAPI_KEY:
            geo_h = _geo_hint(ans["geo"])
            tbs = _parse_timeframe_to_tbs(ans["timeframe"])
            fallback_results = _fallback_search_via_serpapi(queries, per_q=8, geo_hint=geo_h, tbs=tbs)
            ranked = _rerank_results(fallback_results, ans, base_title, base_text)
            return {
                "queries": queries,
                "results": ranked,
                "note": fb_note + " | SerpAPI_FALLBACK_USED" + (" | " + " / ".join(note_parts) if note_parts else ""),
                "took_ms": took_ms,
                "applied_scope": ans,
            }
        else:
            return {
                "queries": queries,
                "results": [],
                "note": fb_note + " | SerpAPI is disabled." + (" | " + " / ".join(note_parts) if note_parts else ""),
                "took_ms": took_ms,
                "applied_scope": ans,
            }

    results = data.get("results") or []
    if not isinstance(results, list):
        results = []
    results = _rerank_results(results, ans, base_title, base_text)

    data["results"] = results
    data["took_ms"] = data.get("took_ms") or took_ms
    if note_parts:
        data["note"] = " / ".join(note_parts)
    data["applied_scope"] = ans

    return data
