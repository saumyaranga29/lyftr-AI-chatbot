import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface FormattedMessageProps {
  content: string;
}

export default function FormattedMessage({ content }: FormattedMessageProps) {
  if (!content) return null;

  // Split content by code blocks: ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  let blockIdx = 0;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(<TextSection key={`text-${blockIdx}-${lastIndex}`} text={textBefore} />);
    }

    const lang = match[1] || 'code';
    const code = match[2];
    parts.push(<CodeBlock key={`code-${blockIdx}-${match.index}`} lang={lang} code={code} />);

    lastIndex = codeBlockRegex.lastIndex;
    blockIdx++;
  }

  const textRemaining = content.substring(lastIndex);
  if (textRemaining) {
    parts.push(<TextSection key={`text-rem-${lastIndex}`} text={textRemaining} />);
  }

  return <div className="space-y-2 leading-relaxed">{parts}</div>;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-2xl overflow-hidden border border-slate-800 bg-[#070a16] shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
        <span className="uppercase tracking-wider font-semibold text-cyan-400">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition py-0.5 px-2 rounded hover:bg-slate-800"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}

function TextSection({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Bullet point check
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-cyan-400 select-none mt-1 text-xs">&bull;</span>
              <span className="flex-1">{renderInlineMarkdown(itemText)}</span>
            </div>
          );
        }

        // Numbered list check (e.g., "1. item")
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-cyan-400 font-mono text-xs select-none mt-0.5 font-semibold">
                {numMatch[1]}.
              </span>
              <span className="flex-1">{renderInlineMarkdown(numMatch[2])}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Parses inline markdown:
 * **bold** -> <strong>
 * *italic* -> <em>
 * `inline code` -> <code>
 */
function renderInlineMarkdown(str: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Regex pattern matching:
  // 1: `code`
  // 2: **bold**
  // 3: *italic*
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;

  let keyCount = 0;
  while ((match = pattern.exec(str)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(str.substring(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={`code-${keyCount}`}
          className="px-1.5 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={`bold-${keyCount}`} className="font-bold text-white text-glow">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={`em-${keyCount}`} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    }

    lastIdx = pattern.lastIndex;
    keyCount++;
  }

  if (lastIdx < str.length) {
    tokens.push(str.substring(lastIdx));
  }

  return tokens;
}
