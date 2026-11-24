from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator

class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    message: str = Field(...)
    system_prompt: Optional[str] = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 1 or len(trimmed) > 4000:
            raise ValueError("message must be between 1 and 4000 characters after trimming whitespace")
        return trimmed

class ChatResponseMetadata(BaseModel):
    resolution_source: Literal["LIVE_INFERENCE", "LLM_CACHE"]
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    key_id: Optional[str] = None
    fallback_attempts: int

class ChatResponse(BaseModel):
    session_id: str
    reply: str
    metadata: ChatResponseMetadata

class HealthResponse(BaseModel):
    status: str
    keys_configured: int
    cache_enabled: bool

class AssistantMetadata(BaseModel):
    resolution_source: Literal["LIVE_INFERENCE", "LLM_CACHE"]
    input_tokens: int
    output_tokens: int

class SessionMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    metadata: Optional[AssistantMetadata] = None

class SessionMessagesResponse(BaseModel):
    session_id: str
    messages: List[SessionMessage]
