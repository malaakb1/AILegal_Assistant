# services/azure_ai.py
from __future__ import annotations
import os
from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from openai import AzureOpenAI

# (محليًا فقط) لقراءة .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# متغيرات البيئة (من Azure Portal أو .env)
AZURE_OPENAI_ENDPOINT   = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY        = os.getenv("AZURE_OPENAI_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT")
API_VERSION             = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")

if not (AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY and AZURE_OPENAI_DEPLOYMENT):
    raise RuntimeError(
        "يرجى ضبط AZURE_OPENAI_ENDPOINT و AZURE_OPENAI_KEY و AZURE_OPENAI_DEPLOYMENT في البيئة أو .env"
    )

client = AzureOpenAI(
    api_key=AZURE_OPENAI_KEY,
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    api_version=API_VERSION,
)

class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(300, gt=1)
    system_prompt: Optional[str] = (
        "You are a helpful assistant for legal document management in the UAE. "
        "Reply in Arabic when the user writes Arabic."
    )

class ChatResponse(BaseModel):
    content: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

def chat(req: ChatRequest) -> ChatResponse:
    msgs = []
    if req.system_prompt:
        msgs.append({"role": "system", "content": req.system_prompt})
    msgs += [m.model_dump() for m in req.messages]

    resp = client.chat.completions.create(
        model=AZURE_OPENAI_DEPLOYMENT,  # اسم الـ deployment (مثلاً gpt35-legal-dev)
        messages=msgs,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
    )
    choice = resp.choices[0].message
    usage = resp.usage
    return ChatResponse(
        content=choice.content or "",
        prompt_tokens=getattr(usage, "prompt_tokens", 0),
        completion_tokens=getattr(usage, "completion_tokens", 0),
        total_tokens=getattr(usage, "total_tokens", 0),
    )
