# backend/api/ai_routes.py
from fastapi import APIRouter, HTTPException
from services.azure_ai import ChatRequest, ChatResponse, chat

router = APIRouter(prefix="/ai", tags=["ai"])

@router.post("/chat", response_model=ChatResponse)
def ai_chat(req: ChatRequest):
    try:
        return chat(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
