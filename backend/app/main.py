import os
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

from app.database import init_db, check_db_health, save_message, get_session_messages
from app.models import (
    ChatRequest,
    ChatResponse,
    ChatResponseMetadata,
    HealthResponse,
    SessionMessagesResponse,
    SessionMessage,
    AssistantMetadata
)
from app.llm_service import llm_service, AllProvidersUnavailable

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure SQLite tables exist
    init_db()
    yield
    # Shutdown

app = FastAPI(title="Lyftr AI Gateway", lifespan=lifespan)

# Setup CORS
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
if not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=HealthResponse)
def get_health():
    db_ok = check_db_health()
    if not db_ok:
        raise HTTPException(status_code=500, detail="Database unreachable")
    
    return HealthResponse(
        status="ok",
        keys_configured=llm_service.get_configured_keys_count(),
        cache_enabled=llm_service.is_cache_enabled()
    )

@app.post("/chat", response_model=ChatResponse)
async def post_chat(
    req: ChatRequest,
    x_simulate_failure: Optional[str] = Header(None, alias="X-Simulate-Failure")
):
    # Retrieve past messages for session
    past_messages = get_session_messages(req.session_id) or []

    # Construct conversation payload for LLM
    llm_messages = []
    
    # Session system prompt or default
    default_system_prompt = "You are a helpful, accurate, and concise AI assistant."
    active_system_prompt = req.system_prompt if req.system_prompt is not None else default_system_prompt
    if active_system_prompt:
        llm_messages.append({"role": "system", "content": active_system_prompt})

    # Add conversation history
    for m in past_messages:
        llm_messages.append({"role": m["role"], "content": m["content"]})

    # Add current user message
    llm_messages.append({"role": "user", "content": req.message})

    try:
        completion = await llm_service.complete_chat(
            messages=llm_messages,
            simulate_failure_header=x_simulate_failure
        )
    except AllProvidersUnavailable:
        # A request that fails is not added to session history
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "all providers unavailable"}
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "all providers unavailable"}
        )

    # Success: persist to SQLite history
    save_message(req.session_id, "user", req.message)
    save_message(
        req.session_id,
        "assistant",
        completion["reply"],
        {
            "resolution_source": completion["resolution_source"],
            "input_tokens": completion["input_tokens"],
            "output_tokens": completion["output_tokens"]
        }
    )

    metadata = ChatResponseMetadata(
        resolution_source=completion["resolution_source"],
        model=completion["model"],
        latency_ms=completion["latency_ms"],
        input_tokens=completion["input_tokens"],
        output_tokens=completion["output_tokens"],
        key_id=completion["key_id"],
        fallback_attempts=completion["fallback_attempts"]
    )

    return ChatResponse(
        session_id=req.session_id,
        reply=completion["reply"],
        metadata=metadata
    )

@app.get("/sessions/{session_id}/messages", response_model=SessionMessagesResponse)
def get_session_history(session_id: str):
    messages = get_session_messages(session_id)
    if messages is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="session not found"
        )

    formatted_messages = []
    for m in messages:
        meta = None
        if m.get("metadata"):
            meta = AssistantMetadata(
                resolution_source=m["metadata"].get("resolution_source", "LIVE_INFERENCE"),
                input_tokens=m["metadata"].get("input_tokens", 0),
                output_tokens=m["metadata"].get("output_tokens", 0)
            )
        formatted_messages.append(
            SessionMessage(
                role=m["role"],
                content=m["content"],
                metadata=meta
            )
        )

    return SessionMessagesResponse(
        session_id=session_id,
        messages=formatted_messages
    )
