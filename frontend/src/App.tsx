import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  Plus,
  Zap,
  ShieldAlert,
  Cpu,
  Database,
  Activity,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Code2,
  BarChart3,
  PenTool,
  BookOpen,
  Paperclip,
  Mic,
  Clock,
  Key,
  ChevronRight,
  Settings,
  MessageSquare,
  Bookmark,
  X
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

const ACTION_CARDS = [
  {
    icon: Code2,
    label: "Code",
    prompt: "Write a Python function to calculate Fibonacci numbers with memoization."
  },
  {
    icon: BarChart3,
    label: "Analyse",
    prompt: "Compare latency, cost, and throughput between LIVE_INFERENCE and LLM_CACHE."
  },
  {
    icon: PenTool,
    label: "Write",
    prompt: "Draft a concise 2-sentence explanation of LiteLLM key failover architecture."
  },
  {
    icon: BookOpen,
    label: "Research",
    prompt: "What is quantum entanglement and how does it relate to quantum computing?"
  }
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
  const [activeModal, setActiveModal] = useState<'none' | 'failover' | 'settings'>('none');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="flex h-screen w-screen bg-[#060814] text-slate-100 overflow-hidden select-none relative font-sans">
      {/* Ambient Holographic Waves & Particle Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-purple-600/15 rounded-full blur-[130px]" />
        <div className="absolute top-1/3 left-1/3 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 right-10 w-[700px] h-[700px] bg-blue-600/15 rounded-full blur-[150px]" />
        
        {/* Holographic light horizon wave */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-purple-950/20 via-cyan-950/10 to-transparent pointer-events-none" />
      </div>

      {/* Futuristic Glassmorphic Sidebar */}
      <aside className="w-64 h-full hidden md:flex flex-col justify-between p-4 bg-[#0a0d1e]/70 backdrop-blur-2xl border-r border-slate-800/80 z-20 shadow-2xl">
        <div className="space-y-6">
          {/* Top Logo */}
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-purple-500 p-[1.5px] shadow-[0_0_15px_rgba(6,182,212,0.5)]">
                <div className="w-full h-full bg-[#070a18] rounded-[10px] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
                </div>
              </div>
            </div>
            <span className="font-extrabold text-base tracking-wider bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-transparent">
              GATEWAY
            </span>
          </div>

          {/* Glowing '+ New Chat' Pill Button */}
          <button
            onClick={startNewSession}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 text-white font-semibold text-xs tracking-wide shadow-[0_0_25px_rgba(147,51,234,0.4)] hover:shadow-[0_0_35px_rgba(147,51,234,0.6)] transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Chat</span>
          </button>

          {/* Navigation Links */}
          <nav className="space-y-1.5 pt-2">
            <button
              onClick={() => setActiveModal('none')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition"
            >
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <span>Chat Workspace</span>
            </button>

            <button
              onClick={() => setActiveModal('failover')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                simulateFailure !== 'none'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Failover Hook</span>
              </div>
              {simulateFailure !== 'none' && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveModal('settings')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition"
            >
              <Settings className="w-4 h-4 text-purple-400" />
              <span>Session Prompt</span>
            </button>
          </nav>
        </div>

        {/* Bottom Profile / Gateway Status Card */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          {health && (
            <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-3 space-y-2 shadow-inner">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                  Status
                </span>
                <span className="text-emerald-400 font-mono font-medium">Online</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-indigo-400" />
                  Key Pool
                </span>
                <span className="text-slate-200 font-mono font-semibold">{health.keys_configured} Keys</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-cyan-400" />
                  Cache
                </span>
                <span className="text-cyan-300 font-mono font-semibold">{health.cache_enabled ? 'Active' : 'Off'}</span>
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-400 px-1 font-mono truncate">
            Session: <span className="text-indigo-400">{sessionId}</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col h-full relative z-10 overflow-hidden">
        {/* Mobile / Small Header */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-[#0a0d1e]/80 backdrop-blur-xl border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-sm tracking-wider text-white">AI GATEWAY</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveModal('failover')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300"
            >
              Failover
            </button>
            <button
              onClick={startNewSession}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium shadow"
            >
              New
            </button>
          </div>
        </header>

        {/* Central Content Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Welcome Screen when messages are empty */}
          {messages.length === 0 && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center max-w-4xl mx-auto px-2">
              <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 w-full my-auto">
                {/* 3D Holographic AI Avatar & Pedestal */}
                <div className="relative flex items-center justify-center w-56 h-56 shrink-0">
                  {/* Concentric rotating neon cyber rings */}
                  <div className="absolute inset-0 rounded-full border border-cyan-500/30 animate-rotate-slow pointer-events-none" />
                  <div className="absolute inset-3 rounded-full border border-dashed border-purple-500/40 animate-rotate-reverse pointer-events-none" />
                  <div className="absolute inset-7 rounded-full border border-indigo-400/20 pointer-events-none" />

                  {/* Pulsing light aura */}
                  <div className="absolute w-44 h-44 rounded-full bg-gradient-to-tr from-cyan-500/20 to-purple-600/30 blur-2xl animate-pulse-glow" />

                  {/* Holographic Glowing Pedestal base */}
                  <div className="absolute -bottom-3 w-40 h-8 rounded-[100%] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent blur-sm pointer-events-none" />
                  <div className="absolute -bottom-2 w-32 h-4 rounded-[100%] border-2 border-cyan-400/80 shadow-[0_0_20px_#06b6d4] pointer-events-none" />

                  {/* Glowing Hologram Robot Sphere / Avatar */}
                  <div className="relative z-10 w-36 h-36 rounded-full bg-gradient-to-b from-slate-900/90 to-purple-950/70 border border-cyan-400/50 shadow-[0_0_35px_rgba(6,182,212,0.4)] flex flex-col items-center justify-center animate-float overflow-hidden">
                    {/* Glowing robot eyes / visor */}
                    <div className="w-16 h-8 rounded-full bg-slate-950 border border-cyan-400/80 flex items-center justify-center gap-3 shadow-[0_0_15px_#06b6d4]">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee] animate-pulse" />
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee] animate-pulse" />
                    </div>

                    {/* Floating mini energy orb in hands */}
                    <div className="mt-3 w-7 h-7 rounded-full bg-gradient-to-tr from-purple-400 to-cyan-300 blur-[1px] shadow-[0_0_18px_#a855f7] animate-spin" />
                  </div>
                </div>

                {/* Greeting & Headline */}
                <div className="text-left space-y-3">
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2">
                    Hello 👋
                  </h1>
                  <p className="text-base text-slate-400 font-light tracking-wide">
                    Your intelligent AI assistant
                  </p>

                  {/* 4 Action Holographic Cards matching user screenshot */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4">
                    {ACTION_CARDS.map((card, idx) => {
                      const IconComponent = card.icon;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(undefined, card.prompt)}
                          className="flex flex-col items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-[#0c1024]/80 hover:bg-[#121838] border border-indigo-500/20 hover:border-cyan-400/60 shadow-lg hover:shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all group active:scale-95"
                        >
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:border-cyan-400/50 transition">
                            <IconComponent className="w-4 h-4 text-indigo-300 group-hover:text-cyan-300 transition" />
                          </div>
                          <span className="text-xs font-semibold text-slate-200 group-hover:text-white tracking-wide">
                            {card.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Messages Feed */}
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end items-start gap-3 pl-12">
                  <div className="space-y-1 max-w-[85%] sm:max-w-[75%]">
                    <div className="bg-gradient-to-r from-purple-700/80 via-indigo-600/80 to-blue-600/80 backdrop-blur-xl border border-purple-400/30 text-white rounded-3xl rounded-tr-md px-5 py-3.5 text-sm shadow-[0_0_20px_rgba(147,51,234,0.2)] break-words leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="text-[10px] text-slate-500 text-right pr-2 font-mono">
                      {msg.timestamp}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-400/50 flex items-center justify-center text-purple-200 text-xs shrink-0 mt-1 shadow-[0_0_10px_rgba(168,85,247,0.4)]">
                    <User className="w-4 h-4" />
                  </div>
                </div>
              );
            }

            if (msg.role === 'error') {
              return (
                <div key={msg.id} className="flex justify-start items-start gap-3 pr-12">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0 mt-1">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="bg-rose-950/40 backdrop-blur-xl border border-rose-500/40 text-rose-200 rounded-3xl rounded-tl-md p-4 max-w-[85%] text-xs shadow-lg space-y-1">
                    <div className="font-semibold text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Request Error
                    </div>
                    <div className="font-mono text-rose-300/90">{msg.content}</div>
                  </div>
                </div>
              );
            }

            const isCached = msg.metadata?.resolution_source === 'LLM_CACHE';

            return (
              <div key={msg.id} className="flex justify-start items-start gap-3 pr-4 sm:pr-12">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500/30 to-purple-500/30 border border-cyan-400/60 flex items-center justify-center text-cyan-300 shrink-0 mt-1 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                  <Bot className="w-4 h-4 text-cyan-300" />
                </div>

                <div
                  data-testid="assistant-message"
                  className="bg-[#0b0e24]/80 backdrop-blur-xl border border-indigo-500/20 hover:border-indigo-500/40 rounded-3xl rounded-tl-md p-5 max-w-[92%] sm:max-w-[85%] text-sm shadow-[0_0_30px_rgba(0,0,0,0.4)] text-slate-100 space-y-4 transition"
                >
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-200 font-normal">
                    {msg.content}
                  </div>

                  {/* Metadata Card Footer matching assignment test requirements */}
                  {msg.metadata && (
                    <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                      {/* Resolution Source */}
                      <span
                        data-testid="meta-source"
                        className={`inline-flex items-center gap-1 font-semibold px-3 py-1 rounded-full text-[11px] shadow-sm ${
                          isCached
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                        }`}
                      >
                        {isCached ? <Zap className="w-3 h-3 text-emerald-400" /> : <Activity className="w-3 h-3 text-cyan-300" />}
                        {msg.metadata.resolution_source}
                      </span>

                      {/* Model */}
                      <span className="text-slate-400 flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 font-mono text-[11px]">
                        <Cpu className="w-3 h-3 text-indigo-400" />
                        <span data-testid="meta-model" className="text-slate-200">
                          {msg.metadata.model}
                        </span>
                      </span>

                      {/* Latency */}
                      <span className="text-slate-400 flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px]">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span
                          data-testid="meta-latency"
                          className={`font-mono ${isCached ? 'text-emerald-400 font-bold' : 'text-amber-300'}`}
                        >
                          {msg.metadata.latency_ms} ms
                        </span>
                      </span>

                      {/* Input Tokens */}
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px]">
                        <span>In:</span>
                        <span data-testid="meta-input-tokens" className="text-indigo-300 font-mono font-semibold">
                          {msg.metadata.input_tokens}
                        </span>
                      </span>

                      {/* Output Tokens */}
                      <span className="text-slate-400 flex items-center gap-1 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px]">
                        <span>Out:</span>
                        <span data-testid="meta-output-tokens" className="text-indigo-300 font-mono font-semibold">
                          {msg.metadata.output_tokens}
                        </span>
                      </span>

                      {/* Key ID if present */}
                      {msg.metadata.key_id && (
                        <span className="text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 font-mono text-[11px] flex items-center gap-1">
                          <Key className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">{msg.metadata.key_id}</span>
                        </span>
                      )}

                      {/* Fallback Attempts Indicator */}
                      {msg.metadata.fallback_attempts !== undefined && msg.metadata.fallback_attempts > 0 && (
                        <span className="text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-xl border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                          <ShieldAlert className="w-3 h-3 text-amber-400" />
                          <span>Fallbacks: {msg.metadata.fallback_attempts}</span>
                        </span>
                      )}

                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="ml-auto text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-white/5 transition"
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

          {isLoading && (
            <div className="flex justify-start items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.4)] animate-pulse">
                <Bot className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="bg-[#0b0e24]/80 border border-slate-800 rounded-3xl rounded-tl-md px-5 py-3.5 text-xs text-slate-400 flex items-center gap-2.5 shadow-lg">
                <Activity className="w-4 h-4 text-cyan-400 animate-spin" />
                <span>Generating response through gateway...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Holographic Pill Input Capsule matching reference image */}
        <div className="px-4 sm:px-8 pb-5 pt-2">
          {simulateFailure !== 'none' && (
            <div className="max-w-3xl mx-auto mb-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-between text-xs text-amber-300">
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                Simulating Failover Header: <strong className="font-mono text-amber-200">{simulateFailure}</strong>
              </span>
              <button
                onClick={() => setSimulateFailure('none')}
                className="text-[11px] underline hover:text-white"
              >
                Reset
              </button>
            </div>
          )}

          <form
            onSubmit={handleSendMessage}
            className="max-w-3xl mx-auto relative flex items-center bg-[#090d20]/80 backdrop-blur-2xl border border-purple-500/40 focus-within:border-cyan-400/70 rounded-full pl-5 pr-2 py-2 shadow-[0_0_30px_rgba(147,51,234,0.25)] focus-within:shadow-[0_0_35px_rgba(6,182,212,0.35)] transition-all"
          >
            <textarea
              ref={textareaRef}
              data-testid="chat-input"
              rows={1}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="w-full bg-transparent border-0 text-slate-100 placeholder-slate-400 text-sm py-1.5 resize-none focus:outline-none scrollbar-none"
            />

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveModal('failover')}
                className="text-slate-400 hover:text-slate-200 p-2 transition rounded-full hover:bg-white/5"
                title="Failover Hook"
              >
                <Sliders className="w-4 h-4" />
              </button>

              <button
                type="submit"
                data-testid="send-button"
                disabled={!inputMessage.trim() || isLoading}
                className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 hover:from-purple-500 hover:to-cyan-300 disabled:opacity-30 text-white flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.5)] transition active:scale-90"
              >
                <Send className="w-4 h-4 translate-x-0.5" />
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Failover Test Hook Modal */}
      {activeModal === 'failover' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#0a0e24] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Failover Test Hook</span>
              </div>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Injects the <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded font-mono">X-Simulate-Failure</code> header into the next request to demonstrate zero-downtime key fallback without real quota exhaustion:
            </p>

            <div className="space-y-2">
              {[
                { label: "Normal Mode (No Failure)", val: "none", desc: "Calls primary key_1 normally" },
                { label: "key_1=429 (Rate Limit)", val: "key_1=429", desc: "Forces key_1 to 429, falls back to key_2" },
                { label: "key_1=500 (Internal Server Error)", val: "key_1=500", desc: "Forces key_1 to 500, falls back to key_2" },
                { label: "*=429 (Total Outage 503)", val: "*=429", desc: "Fails all keys, clean 503 error handling" }
              ].map((item) => (
                <button
                  key={item.val}
                  onClick={() => {
                    setSimulateFailure(item.val);
                    setActiveModal('none');
                  }}
                  className={`w-full text-left p-3 rounded-2xl border transition ${
                    simulateFailure === item.val
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-xs">{item.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Session Settings / System Prompt Modal */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#0a0e24] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Settings className="w-4 h-4 text-purple-400" />
                <span>Session System Prompt</span>
              </div>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Customize AI Personality (Stored in session SQLite history):
              </label>
              <textarea
                data-testid="system-prompt-input"
                rows={3}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="e.g. You are a helpful AI..."
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-2xl p-3 text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
