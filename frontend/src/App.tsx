import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  RefreshCw,
  Zap,
  ShieldAlert,
  Cpu,
  Database,
  Activity,
  AlertTriangle,
  Copy,
  Check,
  Sliders,
  Sparkles,
  Layers,
  ArrowRight,
  Clock,
  Terminal,
  Key
} from 'lucide-react';

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
  timestamp: string;
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

const STARTER_PROMPTS = [
  { title: "Test Cache Hit", prompt: "What is the capital of France?" },
  { title: "Explain Concept", prompt: "Explain how LiteLLM response caching works in 2 sentences." },
  { title: "Python Function", prompt: "Write a Python function to calculate Fibonacci numbers." },
  { title: "Quick Fact", prompt: "Why is the sky blue?" }
];

export default function App() {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('You are a helpful, accurate, and concise AI assistant.');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [simulateFailure, setSimulateFailure] = useState<string>('none');
  const [customSimulate, setCustomSimulate] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize a new session on page load per assignment requirement
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
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendMessage = async (e?: React.FormEvent, directPrompt?: string) => {
    if (e) e.preventDefault();
    const promptToSend = directPrompt !== undefined ? directPrompt : inputMessage;
    const trimmed = promptToSend.trim();
    if (!trimmed || isLoading) return;

    // Reset input immediately per contract: "Empty after sending"
    setInputMessage('');

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: trimmed,
      timestamp: nowStr
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
          content: `Error (${res.status}): ${errorDetail}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, errorMsg]);
      } else {
        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: data.reply,
          metadata: data.metadata,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      const networkErrorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'error',
        content: `Network connection error: ${err.message || 'Unable to connect to backend server'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

  // Calculate session tokens
  const totalSessionTokens = messages.reduce((acc, m) => {
    if (m.metadata) {
      return acc + (m.metadata.input_tokens || 0) + (m.metadata.output_tokens || 0);
    }
    return acc;
  }, 0);

  return (
    <div className="flex h-screen bg-[#090d16] text-slate-100 antialiased overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background ambient lighting */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 max-w-5xl mx-auto w-full px-3 sm:px-6 py-3">
        {/* Top Navbar */}
        <header className="flex items-center justify-between py-2.5 px-4 mb-2 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-xl shadow-black/20">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-950" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                  Lyftr Gateway
                </span>
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Failover & Cache
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                Session: <span className="font-mono text-indigo-300 font-medium">{sessionId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Gateway Health Indicator */}
            {health && (
              <div className="hidden sm:flex items-center gap-2.5 text-xs bg-slate-950/70 border border-slate-800/90 px-3 py-1.5 rounded-xl shadow-inner">
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Online</span>
                </div>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-1 text-slate-300 text-[11px]">
                  <Key className="w-3 h-3 text-indigo-400" />
                  <span>{health.keys_configured} Keys</span>
                </div>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-1 text-slate-300 text-[11px]">
                  <Database className="w-3 h-3 text-amber-400" />
                  <span>Cache {health.cache_enabled ? 'On' : 'Off'}</span>
                </div>
              </div>
            )}

            {/* Settings & Failover Toggle */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all ${
                showSidebar || simulateFailure !== 'none'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Failover Hook</span>
              {simulateFailure !== 'none' && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>

            {/* New Chat Button */}
            <button
              onClick={startNewSession}
              className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium shadow-md shadow-indigo-600/25 transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* Collapsible Failover & System Prompt Controls */}
        {showSidebar && (
          <div className="mb-3 p-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl space-y-3.5 shadow-2xl animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Simulate Failover (X-Simulate-Failure Test Hook)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: "Normal (No Hook)", val: "none" },
                  { label: "key_1=429 (Rate Limit)", val: "key_1=429" },
                  { label: "key_1=500 (Server Error)", val: "key_1=500" },
                  { label: "*=429 (Total Outage 503)", val: "*=429" }
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setSimulateFailure(item.val)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                      simulateFailure === item.val
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-semibold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                <span>System Prompt (Optional - applies to active session):</span>
                <span className="text-[10px] text-slate-400">Persists in SQLite context</span>
              </label>
              <input
                data-testid="system-prompt-input"
                type="text"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="e.g. You are a helpful assistant..."
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500/80 transition"
              />
            </div>
          </div>
        )}

        {/* Quick Simulation Bar (Always accessible indicator when failure simulated) */}
        {simulateFailure !== 'none' && !showSidebar && (
          <div className="mb-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>
                Active Failover Hook: <strong className="font-mono text-amber-200">{simulateFailure}</strong>
              </span>
            </div>
            <button
              onClick={() => setSimulateFailure('none')}
              className="text-[11px] underline hover:text-white"
            >
              Reset to Normal
            </button>
          </div>
        )}

        {/* Chat History View */}
        <div className="flex-1 overflow-y-auto px-1 py-2 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-600/20 via-indigo-500/10 to-cyan-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl shadow-indigo-950/40">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Lyftr AI Chatbot Gateway</h2>
              <p className="text-xs max-w-md text-slate-400 mb-6 leading-relaxed">
                Multi-turn conversation memory in SQLite, zero-downtime key pool failover on 429/5xx, and sub-second prompt caching.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full">
                {STARTER_PROMPTS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(undefined, item.prompt)}
                    className="p-3 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-left transition group shadow-sm"
                  >
                    <div className="text-[11px] font-semibold text-indigo-400 group-hover:text-indigo-300 mb-1 flex items-center justify-between">
                      <span>{item.title}</span>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-xs text-slate-300 line-clamp-1">{item.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end items-start gap-3 pl-12">
                  <div className="space-y-1 max-w-[85%] sm:max-w-[75%]">
                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-md shadow-indigo-950/30 break-words leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="text-[10px] text-slate-400 text-right pr-1 font-mono">
                      {msg.timestamp}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-200 text-xs shrink-0 mt-0.5 shadow-sm">
                    <User className="w-4 h-4 text-indigo-300" />
                  </div>
                </div>
              );
            }

            if (msg.role === 'error') {
              return (
                <div key={msg.id} className="flex justify-start items-start gap-3 pr-12">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 text-xs shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="bg-rose-950/30 border border-rose-500/30 text-rose-200 rounded-2xl rounded-tl-sm p-4 max-w-[85%] text-sm shadow-lg shadow-rose-950/20 space-y-1">
                    <div className="font-semibold text-xs text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Request Error
                    </div>
                    <div className="text-xs font-mono text-rose-300/90">{msg.content}</div>
                  </div>
                </div>
              );
            }

            // Assistant message matching exact testid requirements
            const isCached = msg.metadata?.resolution_source === 'LLM_CACHE';

            return (
              <div key={msg.id} className="flex justify-start items-start gap-3 pr-4 sm:pr-12">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>

                <div
                  data-testid="assistant-message"
                  className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl rounded-tl-sm p-4 max-w-[92%] sm:max-w-[85%] text-sm shadow-lg shadow-black/20 text-slate-100 space-y-3.5"
                >
                  {/* Message Content */}
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-200 font-normal">
                    {msg.content}
                  </div>

                  {/* Metadata Card Footer matching assignment requirements */}
                  {msg.metadata && (
                    <div className="pt-2.5 border-t border-slate-800/90 flex flex-wrap items-center gap-2 text-xs">
                      {/* Resolution Source */}
                      <span
                        data-testid="meta-source"
                        className={`inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-[11px] shadow-sm ${
                          isCached
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-emerald-500/10'
                            : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-cyan-500/10'
                        }`}
                      >
                        {isCached ? <Zap className="w-3 h-3 text-emerald-400" /> : <Activity className="w-3 h-3 text-cyan-400" />}
                        {msg.metadata.resolution_source}
                      </span>

                      {/* Model */}
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800">
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        <span data-testid="meta-model" className="text-slate-200 font-mono text-[11px]">
                          {msg.metadata.model}
                        </span>
                      </span>

                      {/* Latency */}
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span
                          data-testid="meta-latency"
                          className={`font-mono text-[11px] ${isCached ? 'text-emerald-400 font-bold' : 'text-amber-300'}`}
                        >
                          {msg.metadata.latency_ms} ms
                        </span>
                      </span>

                      {/* Input Tokens */}
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800 text-[11px]">
                        <span>In:</span>
                        <span data-testid="meta-input-tokens" className="text-indigo-300 font-mono font-medium">
                          {msg.metadata.input_tokens}
                        </span>
                      </span>

                      {/* Output Tokens */}
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800 text-[11px]">
                        <span>Out:</span>
                        <span data-testid="meta-output-tokens" className="text-indigo-300 font-mono font-medium">
                          {msg.metadata.output_tokens}
                        </span>
                      </span>

                      {/* Key ID if present */}
                      {msg.metadata.key_id && (
                        <span className="text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-slate-800 font-mono text-[11px] flex items-center gap-1">
                          <Key className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">{msg.metadata.key_id}</span>
                        </span>
                      )}

                      {/* Fallback Attempts Indicator */}
                      {msg.metadata.fallback_attempts !== undefined && msg.metadata.fallback_attempts > 0 && (
                        <span className="text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-lg border border-amber-500/30 text-[11px] font-medium flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-amber-400" />
                          <span>Fallbacks: {msg.metadata.fallback_attempts}</span>
                        </span>
                      )}

                      {/* Copy Action */}
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="ml-auto text-slate-500 hover:text-slate-300 p-1 rounded transition"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 animate-pulse">
                <Bot className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-400 flex items-center gap-2.5 shadow-md">
                <Activity className="w-4 h-4 text-indigo-400 animate-spin" />
                <span>Querying gateway with key failover pool...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Input Form */}
        <form onSubmit={handleSendMessage} className="mt-2 relative">
          <div className="relative flex items-end bg-slate-900/90 backdrop-blur-xl border border-slate-800 focus-within:border-indigo-500/80 rounded-2xl p-1.5 shadow-2xl shadow-black/40 transition-all">
            <textarea
              ref={textareaRef}
              data-testid="chat-input"
              rows={2}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything... (Press Enter to send, Shift+Enter for new line)"
              className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-500 text-sm px-3.5 py-2.5 resize-none focus:outline-none scrollbar-none"
            />
            <button
              type="submit"
              data-testid="send-button"
              disabled={!inputMessage.trim() || isLoading}
              className="p-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-40 disabled:hover:from-indigo-600 disabled:hover:to-indigo-500 text-white shadow-md shadow-indigo-600/30 transition active:scale-95 shrink-0 m-1"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between px-3 pt-1.5 text-[10px] text-slate-400">
            <span>Enter sends message &bull; Shift+Enter for new line</span>
            {totalSessionTokens > 0 && (
              <span className="font-mono">Session Tokens: {totalSessionTokens}</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
