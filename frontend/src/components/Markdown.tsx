'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { EvidenceItem } from '@/types';

interface Props {
  content: string;
  evidence?: EvidenceItem[];
  streaming?: boolean;
  onCitationClick?: (nodeId: string) => void;
  nodeNameMap?: Record<string, string>;
}

function buildCitationMap(evidence: EvidenceItem[] = []) {
  const map = new Map<string, string>();
  for (const ev of evidence) {
    map.set(ev.display_name.toLowerCase(), ev.node_id);
    const base = ev.display_name.split('/').pop()?.toLowerCase();
    if (base) map.set(base, ev.node_id);
  }
  return map;
}

function injectCitationChips(text: string, citationMap: Map<string, string>): string {
  if (citationMap.size === 0) return text;
  const names = Array.from(citationMap.keys()).sort((a, b) => b.length - a.length);
  let result = text;
  for (const name of names) {
    const nodeId = citationMap.get(name)!;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(\`[^\`]*${escaped}[^\`]*\`)|(\`[^\`]+\`)|(\\b${escaped}\\b)`, 'gi');
    result = result.replace(re, (match, inCode, otherCode) => {
      if (inCode || otherCode) return match;
      return `[${name}](ferret://${nodeId})`;
    });
  }
  return result;
}

function injectNodeLinks(text: string, nodeNameMap: Record<string, string>): string {
  const keys = Object.keys(nodeNameMap);
  if (keys.length === 0) return text;
  const names = keys.sort((a, b) => b.length - a.length);
  let result = text;
  for (const name of names) {
    const nodeId = nodeNameMap[name];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\`(${escaped})\``, 'gi');
    result = result.replace(re, (_match, captured) => {
      return `[\`${captured}\`](ferret://${nodeId})`;
    });
  }
  return result;
}

export default function Markdown({ content, evidence, streaming, onCitationClick, nodeNameMap }: Props) {
  const citationMap = buildCitationMap(evidence);
  const withCitations = injectCitationChips(content, citationMap);
  const processed = nodeNameMap ? injectNodeLinks(withCitations, nodeNameMap) : withCitations;

  return (
    <div className={`ferret-markdown max-w-[52ch] ${streaming ? 'ferret-streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="text-[13px] leading-[1.65] mb-2 last:mb-0 text-zinc-700">{children}</p>
          ),
          strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
          pre: ({ children }) => (
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words mb-2 last:mb-0 rounded-lg bg-zinc-900/5 border border-zinc-200/80 p-3 text-[11px] font-mono text-zinc-800 leading-relaxed">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return (
              <code
                className={
                  isInline
                    ? 'px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[11px] font-mono text-indigo-800 break-all'
                    : 'text-[11px] font-mono'
                }
              >
                {children}
              </code>
            );
          },
          a: ({ href, children }) => {
            if (href?.startsWith('ferret://') && onCitationClick) {
              const nodeId = href.replace('ferret://', '');
              return (
                <button
                  type="button"
                  onClick={() => onCitationClick(nodeId)}
                  className="inline-flex items-center gap-0.5 mx-0.5 px-2 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-[11px] font-mono font-medium text-indigo-700 hover:bg-indigo-200 hover:border-indigo-300 transition-colors cursor-pointer align-baseline"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} className="text-indigo-600 underline underline-offset-2" target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          ul: ({ children }) => <ul className="list-disc list-outside ml-4 space-y-1 mb-2 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-outside ml-4 space-y-1 mb-2 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="text-[13px] leading-[1.65] text-zinc-700">{children}</li>,
          h1: ({ children }) => <h1 className="text-sm font-bold mb-1.5 text-zinc-900">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-bold mb-1 text-zinc-900">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold mb-0.5 text-zinc-800">{children}</h3>,
          hr: () => <hr className="my-3 border-zinc-200" />,
        }}
      >
        {processed}
      </ReactMarkdown>
      {streaming && <span className="inline-block w-1.5 h-3.5 bg-indigo-500 animate-pulse ml-0.5 align-middle rounded-sm" />}
    </div>
  );
}
