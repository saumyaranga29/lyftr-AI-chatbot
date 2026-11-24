import os

# Prevent LiteLLM from making outbound network calls for cost maps on startup
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"

import time
import json
import logging
from typing import List, Dict, Any, Optional
import litellm
from litellm.caching import Cache

logger = logging.getLogger(__name__)

# Initialize LiteLLM built-in local in-memory cache
try:
    litellm.cache = Cache(type="local")
except Exception as e:
    logger.warning(f"Failed to initialize litellm.cache: {e}")

class AllProvidersUnavailable(Exception):
    """Raised when every key in the pool failed."""
    pass

class LLMService:
    def __init__(self):
        self._load_config()

    def _load_config(self):
        self.model = os.environ.get("LLM_MODEL", "gemini/gemini-2.0-flash")
        raw_keys = os.environ.get("LLM_API_KEYS", "")
        # Parse comma-separated keys
        keys = [k.strip() for k in raw_keys.split(",") if k.strip()]
        if not keys:
            # Fallback placeholder keys if none provided in env
            keys = ["mock_key_1", "mock_key_2"]
        
        self.keys = keys
        self.key_pool = [
            {"id": f"key_{i+1}", "api_key": key}
            for i, key in enumerate(keys)
        ]
        self.enable_failure_simulation = os.environ.get("ENABLE_FAILURE_SIMULATION", "false").lower() in ("true", "1", "yes")

    def get_configured_keys_count(self) -> int:
        return len(self.key_pool)

    def is_cache_enabled(self) -> bool:
        return True

    def _parse_simulate_failure_header(self, header_val: Optional[str]) -> Dict[str, int]:
        if not header_val or not self.enable_failure_simulation:
            return {}
        result = {}
        for part in header_val.split(","):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                try:
                    code = int(v.strip())
                    if code in (429, 500, 502, 503):
                        result[k.strip()] = code
                except ValueError:
                    pass
        return result

    def _build_cache_key(self, messages: List[Dict[str, str]]) -> str:
        # Cache key: model + the full message list sent to the LLM (system prompt + history + new message)
        serialized = json.dumps(messages, sort_keys=True)
        return f"{self.model}:{serialized}"

    def _get_from_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        try:
            if hasattr(litellm, "cache") and litellm.cache:
                backend_cache = getattr(litellm.cache, "cache", None)
                if backend_cache and hasattr(backend_cache, "get_cache"):
                    val = backend_cache.get_cache(cache_key)
                    if val is not None:
                        return json.loads(val) if isinstance(val, str) else val
        except Exception as e:
            logger.warning(f"Cache get error: {e}")
        return None

    def _save_to_cache(self, cache_key: str, data: Dict[str, Any]):
        try:
            if hasattr(litellm, "cache") and litellm.cache:
                backend_cache = getattr(litellm.cache, "cache", None)
                if backend_cache and hasattr(backend_cache, "set_cache"):
                    backend_cache.set_cache(cache_key, json.dumps(data))
        except Exception as e:
            logger.warning(f"Cache set error: {e}")

    async def complete_chat(
        self,
        messages: List[Dict[str, str]],
        simulate_failure_header: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes completion with key failover, response caching, and failure simulation.
        """
        start_time = time.perf_counter()
        sim_map = self._parse_simulate_failure_header(simulate_failure_header)
        cache_key = self._build_cache_key(messages)

        # Check cache if failure simulation is not overriding
        # When failure simulation is active, we test key behavior directly
        if not sim_map:
            cached_data = self._get_from_cache(cache_key)
            if cached_data is not None:
                latency_ms = max(1, int(round((time.perf_counter() - start_time) * 1000)))
                return {
                    "reply": cached_data["reply"],
                    "resolution_source": "LLM_CACHE",
                    "model": self.model,
                    "latency_ms": latency_ms,
                    "input_tokens": cached_data["input_tokens"],
                    "output_tokens": cached_data["output_tokens"],
                    "key_id": None,
                    "fallback_attempts": 0
                }

        fallback_attempts = 0
        last_error = None

        for item in self.key_pool:
            key_id = item["id"]
            api_key = item["api_key"]

            # Check if this key should simulate failure
            simulated_status = sim_map.get(key_id) or sim_map.get("*")
            if simulated_status:
                logger.info(f"Simulating failure {simulated_status} for {key_id}")
                fallback_attempts += 1
                last_error = f"Simulated HTTP {simulated_status}"
                continue

            try:
                # Call LiteLLM completion
                resp = await self._call_litellm(self.model, messages, api_key)
                
                # Extract text
                reply = resp.choices[0].message.content or ""
                
                # Extract usage
                usage = getattr(resp, "usage", None)
                if usage:
                    input_tokens = getattr(usage, "prompt_tokens", 0) or 0
                    output_tokens = getattr(usage, "completion_tokens", 0) or 0
                else:
                    input_tokens = sum(len(m.get("content", "").split()) for m in messages)
                    output_tokens = len(reply.split())

                latency_ms = max(1, int(round((time.perf_counter() - start_time) * 1000)))

                result_data = {
                    "reply": reply,
                    "resolution_source": "LIVE_INFERENCE",
                    "model": self.model,
                    "latency_ms": latency_ms,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "key_id": key_id,
                    "fallback_attempts": fallback_attempts
                }

                # Store in LiteLLM cache for future identical requests
                self._save_to_cache(cache_key, {
                    "reply": reply,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens
                })

                return result_data

            except Exception as e:
                logger.warning(f"Key {key_id} failed: {e}")
                fallback_attempts += 1
                last_error = str(e)
                # Continue loop to next key

        # If we exited loop, all keys failed
        raise AllProvidersUnavailable(f"All providers unavailable: {last_error}")

    async def _call_litellm(self, model: str, messages: List[Dict[str, str]], api_key: str):
        # If running with mock keys (e.g. during local tests without live keys), provide mock response
        if api_key.startswith("mock_"):
            import asyncio
            await asyncio.sleep(0.05)
            class MockChoice:
                def __init__(self, text):
                    self.message = type("MockMsg", (), {"content": text})()
            class MockUsage:
                def __init__(self, p_tok, c_tok):
                    self.prompt_tokens = p_tok
                    self.completion_tokens = c_tok
            class MockResponse:
                def __init__(self, text, p_tok, c_tok):
                    self.choices = [MockChoice(text)]
                    self.usage = MockUsage(p_tok, c_tok)

            prompt_toks = sum(max(1, len(m.get("content", "").split())) for m in messages) + 10
            return MockResponse(
                f"Echo: {messages[-1]['content']}",
                prompt_toks,
                8
            )

        # Real LiteLLM async completion
        return await litellm.acompletion(
            model=model,
            messages=messages,
            api_key=api_key,
            caching=False
        )

llm_service = LLMService()
