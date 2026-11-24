import os
import pytest
from fastapi.testclient import TestClient

# Configure test environment variables before importing app
os.environ["DATABASE_URL"] = "sqlite:///./test_app.db"
os.environ["LLM_API_KEYS"] = "mock_key_1,mock_key_2,mock_key_3"
os.environ["ENABLE_FAILURE_SIMULATION"] = "true"
os.environ["LLM_MODEL"] = "gemini/gemini-2.0-flash"

from app.main import app
from app.database import init_db, get_connection

@pytest.fixture(autouse=True)
def clean_db():
    init_db()
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM messages;")
    conn.close()
    yield
    # Cleanup test db
    try:
        if os.path.exists("./test_app.db"):
            os.remove("./test_app.db")
    except Exception:
        pass

client = TestClient(app)

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["keys_configured"] >= 2
    assert data["cache_enabled"] is True

def test_chat_validation_errors():
    # Empty message
    res = client.post("/chat", json={"session_id": "s-1", "message": "   "})
    assert res.status_code == 422
    assert "detail" in res.json()

    # Missing session_id
    res = client.post("/chat", json={"message": "hello"})
    assert res.status_code == 422

    # Message over 4000 characters
    res = client.post("/chat", json={"session_id": "s-1", "message": "a" * 4001})
    assert res.status_code == 422

def test_chat_live_and_cache_hit():
    session_id = "s-test-cache-1"
    # First request: LIVE_INFERENCE
    res1 = client.post("/chat", json={"session_id": session_id, "message": "What is the capital of France?"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["session_id"] == session_id
    assert data1["reply"] != ""
    assert data1["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert data1["metadata"]["key_id"] == "key_1"
    assert data1["metadata"]["fallback_attempts"] == 0
    assert data1["metadata"]["input_tokens"] > 0
    assert data1["metadata"]["output_tokens"] > 0

    # Second request in a new session with the identical message: LLM_CACHE
    session_id_2 = "s-test-cache-2"
    res2 = client.post("/chat", json={"session_id": session_id_2, "message": "What is the capital of France?"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["session_id"] == session_id_2
    assert data2["reply"] == data1["reply"]
    assert data2["metadata"]["resolution_source"] == "LLM_CACHE"
    assert data2["metadata"]["key_id"] is None
    assert data2["metadata"]["fallback_attempts"] == 0
    assert data2["metadata"]["input_tokens"] == data1["metadata"]["input_tokens"]
    assert data2["metadata"]["output_tokens"] == data1["metadata"]["output_tokens"]

    # Different message should be LIVE_INFERENCE
    res3 = client.post("/chat", json={"session_id": session_id_2, "message": "What is the capital of Germany?"})
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["metadata"]["resolution_source"] == "LIVE_INFERENCE"

def test_failover_simulation():
    session_id = "s-test-failover"
    
    # Simulate key_1 failure with 429 -> should fallback to key_2
    res = client.post(
        "/chat",
        json={"session_id": session_id, "message": "Tell me a joke"},
        headers={"X-Simulate-Failure": "key_1=429"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["metadata"]["key_id"] == "key_2"
    assert data["metadata"]["fallback_attempts"] == 1

    # Simulate key_1=500 -> should fallback to key_2
    session_id_500 = "s-test-500"
    res500 = client.post(
        "/chat",
        json={"session_id": session_id_500, "message": "Tell me another joke"},
        headers={"X-Simulate-Failure": "key_1=500"}
    )
    assert res500.status_code == 200
    data500 = res500.json()
    assert data500["metadata"]["key_id"] == "key_2"
    assert data500["metadata"]["fallback_attempts"] == 1

    # Simulate *=429 -> all keys fail -> 503
    session_id_all_fail = "s-test-all-fail"
    res_fail = client.post(
        "/chat",
        json={"session_id": session_id_all_fail, "message": "This will fail"},
        headers={"X-Simulate-Failure": "*=429"}
    )
    assert res_fail.status_code == 503
    assert res_fail.json() == {"detail": "all providers unavailable"}

    # Verify failed request was NOT added to history
    res_history = client.get(f"/sessions/{session_id_all_fail}/messages")
    assert res_history.status_code == 404
    assert res_history.json() == {"detail": "session not found"}

def test_session_history():
    session_id = "s-test-history"
    # Send first message
    client.post("/chat", json={"session_id": session_id, "message": "First message"})
    # Send second message
    client.post("/chat", json={"session_id": session_id, "message": "Second message"})

    # Fetch history
    res = client.get(f"/sessions/{session_id}/messages")
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == session_id
    messages = data["messages"]
    assert len(messages) == 4 # 2 user, 2 assistant
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "First message"
    assert messages[1]["role"] == "assistant"
    assert "metadata" in messages[1]
    assert messages[1]["metadata"]["resolution_source"] in ("LIVE_INFERENCE", "LLM_CACHE")
    assert messages[2]["role"] == "user"
    assert messages[2]["content"] == "Second message"
    assert messages[3]["role"] == "assistant"

def test_unknown_session_404():
    res = client.get("/sessions/non-existent-session-12345/messages")
    assert res.status_code == 404
    assert res.json() == {"detail": "session not found"}
