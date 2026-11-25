# Lyftr AI Full-Stack Assignment: LLM Chatbot with Key Failover & Response Caching

A resilient, high-performance full-stack AI chatbot application featuring multi-turn conversation memory in SQLite, zero-downtime API key failover using LiteLLM, prompt-based response caching, and an interactive UI meeting strict test contracts.

---

## 1. Live URLs

- **Frontend Application**: https://frontend-sandy-two-38.vercel.app/
- **Backend API Base**: `https://lyftr-ai-chatbot-backend-daii.onrender.com
- **Public GitHub Repository**: https://github.com/saumyaranga29/lyftr-AI-chatbot


---

## 2. Run locally: with Docker and without

### Option A: With Docker (Recommended)

Make sure Docker and Docker Compose are installed and running.

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd "Lyftr AI"
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and supply your LLM_API_KEYS (e.g. Gemini, Groq, or OpenAI keys)
   ```

3. **Start the complete stack with Make:**
   ```bash
   make up
   ```
   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:8000](http://localhost:8000)
   - **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health check**: [http://localhost:8000/health](http://localhost:8000/health)

4. **Tear down the stack:**
   ```bash
   make down
   ```

---

### Option B: Without Docker (Local Development)

#### 1. Backend Setup (FastAPI + LiteLLM)

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
export DATABASE_URL="sqlite:///./app.db"
export LLM_API_KEYS="your_key_1,your_key_2"
export LLM_MODEL="gemini/gemini-2.0-flash"
export ENABLE_FAILURE_SIMULATION="true"
export ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"

# Run tests
pytest tests/test_api.py -v

# Start FastAPI server on port 8000
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup (React + Vite)

```bash
cd frontend

# Install npm dependencies
npm install

# Start Vite development server on port 3000
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Design decisions: key fallback, caching, SQLite session storage

### Key Pool & Automatic Failover
- **Pool Representation**: The backend parses `LLM_API_KEYS` into an ordered list of keys identified as `key_1`, `key_2`, ..., `key_N`.
- **Resilient Fallback**: When an active key triggers an HTTP 429 (rate-limit/quota exhausted), 500, 502, or 503, the backend catches the error, increments `fallback_attempts`, and automatically retries with the next key in the pool.
- **Fail-Safe Exhaustion**: If all keys fail, the backend cleanly returns HTTP 503 with body `{"detail": "all providers unavailable"}` without saving the failed attempt into session history and without leaking internal stack traces.
- **Privacy & Security**: The API contract strictly returns `key_id` (e.g. `"key_1"`) and never exposes the raw API key to the client.

### Response Caching
- **Cache Key Design**: Strictly computed from `model + full message list sent to the LLM (system prompt + history + new message)`.
- **LiteLLM Built-in Cache**: Backed by LiteLLM's fast in-memory caching engine (`litellm.cache = Cache(type="local")`).
- **Cache Hit Mechanics**:
  - The second identical message in a new session returns `LLM_CACHE`.
  - On a cache hit, `key_id` is `null` and `fallback_attempts` is `0`.
  - Stored token usages (`input_tokens` and `output_tokens`) from the original inference are preserved.
  - Latency is server-measured in milliseconds, reliably faster than a live call.

### SQLite Session Storage
- **Zero External Dependencies**: Implemented using Python's native `sqlite3` without heavyweight ORM overhead.
- **Persistence Across Container Restarts**: The database resides under the Docker volume at `/data/app.db` via `DATABASE_URL=sqlite:////data/app.db`.
- **Schema**: Auto-created on startup with an index on `session_id`:
  ```sql
  CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  ```
- **Error Resilience**: Messages are only recorded on successful generation (HTTP 200). 422 and 503 requests are never added to the database.

---

## 4. Verification: how to see failover, cache hits and per-message token usage

### 1. Per-Message Token Usage & Metadata
Each assistant message container (`data-testid="assistant-message"`) prominently displays:
- Resolution Source (`data-testid="meta-source"`): `LIVE_INFERENCE` or `LLM_CACHE`.
- Model (`data-testid="meta-model"`): e.g. `gemini/gemini-2.0-flash`.
- Latency (`data-testid="meta-latency"`): e.g. `412 ms`.
- Input Tokens (`data-testid="meta-input-tokens"`): tokens for prompt + session history.
- Output Tokens (`data-testid="meta-output-tokens"`): tokens for the reply.
- Active Key ID & Fallback Count.

### 2. Verifying Response Caching
1. In the UI or via curl, send a message in Session A:
   ```bash
   curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"session_id": "s-1", "message": "What is the capital of France?"}'
   ```
   *Result:* `resolution_source`: `"LIVE_INFERENCE"`, `key_id`: `"key_1"`.
2. Click **New Chat** (or send with a new `session_id` e.g. `"s-2"`) with the identical message:
   ```bash
   curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"session_id": "s-2", "message": "What is the capital of France?"}'
   ```
   *Result:* `resolution_source`: `"LLM_CACHE"`, `key_id`: `null`, `fallback_attempts`: `0`, with near-instantaneous response latency.

### 3. Verifying Failover (`X-Simulate-Failure`)
Ensure `ENABLE_FAILURE_SIMULATION=true` in `.env`.

- **Test Fallback from `key_1` to `key_2`:**
  ```bash
  curl -X POST http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -H "X-Simulate-Failure: key_1=429" \
    -d '{"session_id": "s-test", "message": "Explain key failover."}'
  ```
  *Result:* HTTP 200, `key_id`: `"key_2"`, `fallback_attempts`: `1`.

- **Test Complete Outage (`*=429`):**
  ```bash
  curl -X POST http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -H "X-Simulate-Failure: *=429" \
    -d '{"session_id": "s-fail", "message": "Simulate complete failure."}'
  ```
  *Result:* HTTP 503 `{"detail": "all providers unavailable"}`. History check confirms nothing was added to SQLite.

- **In the UI:** Use the built-in **Failover & Prompt** drawer at the top right of the interface to select `key_1=429` or `*=429` directly from a dropdown before sending!

---

## 5. Setup Used: your editor and AI tools

- **Development Environment**: Visual Studio Code / Google Antigravity Agent.
- **AI Tooling & Coding Assistants**: Google Gemini 3.8 Flash for rapid scaffolding, verification planning, and contract validation.
- **Runtimes & SDKs**:
  - Python 3.12 (FastAPI, LiteLLM, Pytest, Uvicorn, SQLite3)
  - Node.js 22 (React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons)
  - Docker & Docker Compose (Multi-stage container builds)

---

## 6. Bonus features (if any): what you added beyond the requirements and why

1. **Interactive Simulation Bar in UI**: Built-in visual dropdown in the header allowing anyone testing or reviewing the demo video to inject `X-Simulate-Failure` headers without opening curl or devtools.
2. **Real-Time Health Status Pill**: Displays database status, active key pool count, and caching status directly in the navbar connected to `GET /health`.
3. **Session Reset Button**: Allows instant generation of a fresh `session_id` and history clear in one click.
4. **Comprehensive Automated Test Suite**: Included 6 pytest test cases covering all edge cases (validation 422s, 404 on unknown session, failover on 429/500, full outage 503, cache hits, token verification).
5. **Nginx Reverse Proxy Ready**: Production Nginx container configuration with fallback SPA routing and `/api` proxying.
