import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, RefreshCw, Zap, ShieldAlert, Cpu, Database, Activity, AlertTriangle } from 'lucide-react';

interface MessageMetadata {
  resolution_source: 'LIVE_INFERENCE' | 'LLM_CACHE';
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  key_id?: string | null;
  fallback_attempts?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  metadata?: MessageMetadata;
}

interface HealthStatus {
  status: string;
  keys_configured: number;
  cache_enabled: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function generateSessionId(): string {
  const randomPart = Math.random().toString(36).substring(2, 8);
  const timePart = Date.now().toString(36).slice(-4);
  return `s-${randomPart}${timePart}`;
}

export default function App() {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('You are a helpful, accurate, and concise AI assistant.');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [simulateFailure, setSimulateFailure] = useState<string>('none');
  const [customSimulate, setCustomSimulate] = useState<string>('');
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize a new session on page load
  useEffect(() => {
    const newSession = generateSessionId();
    setSessionId(newSession);
    checkHealth();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    }
  };

  const startNewSession = () => {
    const newSession = generateSessionId();
    setSessionId(newSession);
    setMessages([]);
    checkHealth();
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed || isLoading) return;

    // Reset input immediately per contract: "Empty after sending"
    setInputMessage('');

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: trimmed
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Determine simulation header
    let simHeader: string | null = null;
    if (simulateFailure === 'custom') {
      if (customSimulate.trim()) simHeader = customSimulate.trim();
    } else if (simulateFailure !== 'none') {
      simHeader = simulateFailure;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (simHeader) {
        headers['X-Simulate-Failure'] = simHeader;
      }

      const payload: Record<string, any> = {
        session_id: sessionId,
        message: trimmed
      };
      if (systemPrompt.trim()) {
        payload.system_prompt = systemPrompt.trim();
      }

      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorDetail = 'Unknown error occurred';
        try {
          const errData = await res.json();
          errorDetail = errData.detail || JSON.stringify(errData);
        } catch {
          errorDetail = `HTTP ${res.status} ${res.statusText}`;
        }

        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: 'error',
          content: `Error (${res.status}): ${errorDetail}`
        };
        setMessages(prev => [...prev, errorMsg]);
      } else {
        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: data.reply,
          metadata: data.metadata
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      const networkErrorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'error',
        content: `Network connection error: ${err.message || 'Unable to connect to backend server'}`
      };
      setMessages(prev => [...prev, networkErrorMsg]);
    } finally {
      setIsLoading(false);
      checkHealth();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto px-4 py-3">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 mb-3 gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Lyftr AI LLM Gateway
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Resilient & Cached
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Active Session: <span className="font-mono text-indigo-300">{sessionId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {health && (
            <div className="flex items-center gap-3 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Online
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-300 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                {health.keys_configured} Keys
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-300 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                Cache {health.cache_enabled ? 'Active' : 'Off'}
              </span>
            </div>
          )}

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            {showConfig ? 'Hide Controls' : 'Failover & Prompt'}
          </button>

          <button
            onClick={startNewSession}
            title="Start New Session"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>
      </header>

      {/* Failover Test Hook & System Prompt Drawer */}
      {showConfig && (
        <div className="mb-3 p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-3 animate-in fade-in">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              System Prompt (Optional - applies to active session):
            </label>
            <input
              data-testid="system-prompt-input"
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are a helpful assistant..."
              className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="border-t border-slate-800/80 pt-2 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Failover Test Hook (X-Simulate-Failure):</span>
            </div>
            <select
              value={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.value)}
              className="text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="none">None (Standard Normal Flow)</option>
              <option value="key_1=429">key_1=429 (Simulate Rate Limit on key_1)</option>
              <option value="key_1=500">key_1=500 (Simulate Server 500 on key_1)</option>
              <option value="key_1=429,key_2=500">key_1=429, key_2=500</option>
              <option value="*=429">*=429 (Fail Every Key -&gt; 503)</option>
              <option value="custom">Custom Header Value...</option>
            </select>

            {simulateFailure === 'custom' && (
              <input
                type="text"
                placeholder="e.g. key_1=502"
                value={customSimulate}
                onChange={(e) => setCustomSimulate(e.target.value)}
                className="text-xs bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200"
              />
            )}
            <span className="text-[11px] text-slate-400 ml-auto">
              Header is sent with next message to verify resilient fallback.
            </span>
          </div>
        </div>
      )}

      {/* Chat Messages Container */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3 border border-indigo-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-200 mb-1">Lyftr Gateway Chat Ready</h2>
            <p className="text-xs max-w-md text-slate-400 mb-4">
              Multi-turn state in SQLite, automatic key pool fallback on 429/5xx, and instantaneous response caching.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              <button
                onClick={() => setInputMessage('What is the capital of France?')}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 transition"
              >
                "What is the capital of France?"
              </button>
              <button
                onClick={() => setInputMessage('Explain how LiteLLM caching works in 2 sentences.')}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 transition"
              >
                "Explain how LiteLLM caching works in 2 sentences."
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end items-start gap-2.5">
                <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] sm:max-w-[75%] text-sm shadow-sm break-words">
                  {msg.content}
                </div>
                <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-indigo-200 text-xs shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              </div>
            );
          }

          if (msg.role === 'error') {
            return (
              <div key={msg.id} className="flex justify-start items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-red-900/40 border border-red-500/30 flex items-center justify-center text-red-400 text-xs shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="bg-red-950/50 border border-red-900/60 text-red-200 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] text-sm">
                  <div className="font-semibold text-xs text-red-400 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Request Error
                  </div>
                  {msg.content}
                </div>
              </div>
            );
          }

          // Assistant message with exact contract attributes
          return (
            <div key={msg.id} className="flex justify-start items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div
                data-testid="assistant-message"
                className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-sm p-4 max-w-[90%] sm:max-w-[80%] text-sm shadow-sm text-slate-200 space-y-3"
              >
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                {/* Metadata footer matching strict frontend test contract */}
                {msg.metadata && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                    {/* meta-source */}
                    <span
                      data-testid="meta-source"
                      className={`font-semibold px-2 py-0.5 rounded-full border text-[11px] ${
                        msg.metadata.resolution_source === 'LLM_CACHE'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {msg.metadata.resolution_source}
                    </span>

                    {/* meta-model */}
                    <span className="text-slate-400 flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                      Model: <span data-testid="meta-model" className="text-slate-200 font-mono">{msg.metadata.model}</span>
                    </span>

                    {/* meta-latency */}
                    <span className="text-slate-400 flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                      Latency: <span data-testid="meta-latency" className="text-amber-300 font-mono">{msg.metadata.latency_ms} ms</span>
                    </span>

                    {/* meta-input-tokens */}
                    <span className="text-slate-400 flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                      In: <span data-testid="meta-input-tokens" className="text-indigo-300 font-mono">{msg.metadata.input_tokens}</span>
                    </span>

                    {/* meta-output-tokens */}
                    <span className="text-slate-400 flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                      Out: <span data-testid="meta-output-tokens" className="text-indigo-300 font-mono">{msg.metadata.output_tokens}</span>
                    </span>

                    {/* Key Id & Fallback Attempts Details */}
                    {msg.metadata.key_id && (
                      <span className="text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800 font-mono text-[11px]">
                        Key: <span className="text-emerald-300">{msg.metadata.key_id}</span>
                      </span>
                    )}

                    {msg.metadata.fallback_attempts !== undefined && msg.metadata.fallback_attempts > 0 && (
                      <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-[11px] font-medium">
                        Fallbacks: {msg.metadata.fallback_attempts}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-xs shrink-0">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400 animate-spin" />
              <span>Querying gateway with key failover...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="mt-3 relative">
        <div className="flex items-end bg-slate-900 border border-slate-800 rounded-2xl p-1.5 focus-within:border-indigo-500 transition shadow-lg">
          <textarea
            data-testid="chat-input"
            rows={2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-500 text-sm px-3 py-2 resize-none focus:outline-none"
          />
          <button
            type="submit"
            data-testid="send-button"
            disabled={!inputMessage.trim() || isLoading}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition shrink-0 m-1"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
