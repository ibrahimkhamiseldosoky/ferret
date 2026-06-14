'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, GripHorizontal, MessageSquareText, Map, BookOpen, Compass, Clock } from 'lucide-react';
import CustomScrollArea from './CustomScrollArea';
import Markdown from './Markdown';
import ConceptsBar from './ConceptsBar';
import type { QAItem, OnboardingData, GraphNode } from '@/types';

const EXPLAIN_PRESETS = [
  { label: 'Explain Repository', question: 'Explain the overall architecture and purpose of this repository.' },
  { label: 'Find Dead Code', question: 'Identify potentially unused or dead code in this repository.' },
];

const SHOW_PRESETS = [
  { label: 'Show Authentication', question: 'Show me the authentication flow in this codebase.' },
  { label: 'Show Main Services', question: 'Show me the main services and how they connect.' },
  { label: 'Show Request Flow', question: 'Show me the typical request flow from entry to response.' },
];

interface Props {
  onAsk: (question: string, mode?: 'explain' | 'show') => void;
  onEvidenceClick: (nodeId: string) => void;
  loading: boolean;
  chatHistory: QAItem[];
  streamingText?: string | null;
  side?: boolean;
  onboardingData?: OnboardingData | null;
  onboardingLoading?: boolean;
  fileCount?: number;
  repoName?: string;
  graphNodes?: GraphNode[];
}

function ChatMessage({
  item, index, isLast, loading, streamingText, onEvidenceClick, priorQuestions, nodeNameMap,
}: {
  item: QAItem;
  index: number;
  isLast: boolean;
  loading: boolean;
  streamingText?: string | null;
  onEvidenceClick: (nodeId: string) => void;
  priorQuestions: string[];
  nodeNameMap: Record<string, string>;
}) {
  const isStreaming = loading && isLast;
  const displayAnswer = isStreaming && streamingText != null ? streamingText : item.answer;
  const showStreamingCursor = isStreaming && streamingText != null && streamingText.length > 0;

  const historyNote = useMemo(() => {
    if (index === 0 || priorQuestions.length === 0) return null;
    const related = priorQuestions.find(
      (q) =>
        q !== item.question &&
        item.question.toLowerCase().split(/\s+/).some((w) => w.length > 4 && q.toLowerCase().includes(w))
    );
    if (related) {
      return `Building on your earlier question about "${related.length > 50 ? related.slice(0, 47) + '\u2026' : related}"`;
    }
    return null;
  }, [index, priorQuestions, item.question]);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 justify-end">
        <div className="max-w-[85%] [overflow-wrap:break-word] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-xs leading-relaxed">
          <p className="text-[10px] text-indigo-200/90 font-semibold uppercase tracking-wider">
            {item.mode || 'explain'}
          </p>
          <p className="mt-1.5">{item.question}</p>
        </div>
        <User className="w-5 h-5 text-zinc-400 shrink-0 mt-1" />
      </div>
      <div className="flex items-start gap-2">
        <Bot className="w-5 h-5 text-indigo-600 shrink-0 mt-1" />
        <div className="max-w-[85%] [overflow-wrap:break-word] bg-zinc-50 border border-zinc-100 text-zinc-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {item.mode || 'explain'}
          </p>
          <div className="mt-1.5">
          {isStreaming && (!streamingText || streamingText.length === 0) ? (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <>
              {historyNote && (
                <p className="text-[10px] text-indigo-600/80 italic mb-2 pb-2 border-b border-zinc-200">{historyNote}</p>
              )}
              <Markdown
                content={displayAnswer}
                evidence={item.evidence}
                streaming={showStreamingCursor}
                onCitationClick={onEvidenceClick}
                nodeNameMap={nodeNameMap}
              />
              {!isStreaming && item.degraded_mode && item.warnings && item.warnings.length > 0 && (
                <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200">
                  <p className="text-[10px] text-amber-700 font-medium">AI explanation partially simplified</p>
                  {item.warnings.map((w, wi) => (
                    <p key={wi} className="text-[9px] text-amber-600 mt-0.5">{w}</p>
                  ))}
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AIAssistant({
  onAsk, onEvidenceClick, loading, chatHistory, streamingText, side,
  onboardingData, onboardingLoading, fileCount, graphNodes,
}: Props) {
  const [input, setInput] = useState('');
  const [height, setHeight] = useState(200);
  const [width, setWidth] = useState(320);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number; startX: number; startWidth: number } | null>(null);

  const priorQuestions = useMemo(
    () => chatHistory.slice(0, -1).map((c) => c.question),
    [chatHistory]
  );

  const nodeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!graphNodes) return map;
    for (const node of graphNodes) {
      map[node.label.toLowerCase()] = node.node_id;
      const base = node.label.split('/').pop()?.toLowerCase();
      if (base) map[base] = node.node_id;
    }
    return map;
  }, [graphNodes]);

  const hasOnboarding = onboardingData && !onboardingLoading;
  const coreConcepts = onboardingData?.core_concepts || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, streamingText]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    onAsk(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (side) {
      resizeRef.current = { startY: 0, startX: e.clientX, startHeight: 0, startWidth: width };
      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const diff = resizeRef.current.startX - ev.clientX;
        setWidth(Math.max(280, Math.min(520, resizeRef.current.startWidth + diff)));
      };
      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      resizeRef.current = { startY: e.clientY, startX: 0, startHeight: height, startWidth: 0 };
      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const diff = resizeRef.current.startY - ev.clientY;
        setHeight(Math.max(120, Math.min(500, resizeRef.current.startHeight + diff)));
      };
      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const presetSection = (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <MessageSquareText className="w-3 h-3 text-zinc-400" />
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Explain</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXPLAIN_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onAsk(p.question, 'explain')}
            disabled={loading}
            className="px-2.5 py-1 rounded-md bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 px-1 pt-1">
        <Map className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">Show</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SHOW_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onAsk(p.question, 'show')}
            disabled={loading}
            className="px-2.5 py-1 rounded-md bg-indigo-50 border border-indigo-100 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );

  const onboardingLoadingEl = onboardingLoading && !onboardingData && (
    <div className="space-y-3 px-1">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
          <Compass className="w-3 h-3 text-indigo-600" />
        </div>
        <span className="text-xs font-semibold text-zinc-700">Getting started</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        <span className="text-xs text-zinc-400 ml-1">Analyzing repository structure...</span>
      </div>
    </div>
  );

  const onboardingSection = hasOnboarding && (
    <div className="space-y-3">
      <div className="flex items-start gap-2 px-1">
        <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Compass className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-zinc-800">Getting started</span>
            {fileCount !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full bg-zinc-100 text-[10px] text-zinc-600 font-medium">
                {fileCount} files
              </span>
            )}
            {onboardingData.estimated_hours > 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] text-amber-700 font-medium whitespace-nowrap">
                <Clock className="w-2.5 h-2.5" />
                ~{onboardingData.estimated_hours}h
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed px-1">{onboardingData.overview}</p>

      <div className="border-b border-zinc-100" />

      {onboardingData.reading_order.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <BookOpen className="w-3 h-3 text-indigo-600" />
            <span className="text-[11px] font-semibold text-zinc-700">Reading order</span>
          </div>
          <div className="space-y-0.5">
            {onboardingData.reading_order.map((item, i) => {
              const filename = item.node_id.split(':').pop()?.split(/[/\\]/).pop() || item.node_id;
              return (
                <div key={item.node_id} className="flex items-start gap-2.5 p-2.5 border-l-2 border-transparent">
                  <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200 text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono font-medium text-zinc-700">{filename}</span>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{item.reason}</p>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[9px] font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
    
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-b border-zinc-100" />
    </div>
  );

  const chatMessages = (
    <>
      {onboardingLoadingEl}
      {chatHistory.length === 0 && !hasOnboarding && !onboardingLoading && (
        <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
          <p className="text-xs text-zinc-400 text-center">Ask a question or pick a preset below.</p>
          {presetSection}
        </div>
      )}
      {onboardingSection}
      {chatHistory.map((item, i) => (
        <ChatMessage
          key={i}
          item={item}
          index={i}
          isLast={i === chatHistory.length - 1}
          loading={loading}
          streamingText={streamingText}
          onEvidenceClick={onEvidenceClick}
          priorQuestions={priorQuestions.slice(0, i)}
          nodeNameMap={nodeNameMap}
        />
      ))}
      <div ref={messagesEndRef} />
    </>
  );

  const conceptsBar = hasOnboarding && coreConcepts.length > 0 && (
    <ConceptsBar
      concepts={coreConcepts}
      onAsk={(q) => onAsk(q, 'explain')}
    />
  );

  const inputBar = (
    <div className="px-4 py-2 border-t border-zinc-100 shrink-0">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1 h-9 px-3 rounded-lg border border-zinc-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (side) {
    return (
      <div className="border-r border-zinc-200 bg-white flex flex-col shrink-0" style={{ width }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-100 shrink-0">
          {hasOnboarding ? (
            <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
              <Compass className="w-3 h-3 text-indigo-600" />
            </div>
          ) : (
            <Bot className="w-4 h-4 text-indigo-600" />
          )}
          <span className="text-xs font-semibold text-zinc-700">
            {hasOnboarding ? 'Getting started' : 'AI Assistant'}
          </span>
          <div className="ml-auto cursor-ew-resize p-1 hover:bg-zinc-100 rounded" onMouseDown={handleResizeStart}>
            <GripHorizontal className="w-3.5 h-3.5 text-zinc-400 rotate-90" />
          </div>
        </div>
        {chatHistory.length > 0 && (
          <CustomScrollArea className="border-b border-zinc-100 shrink-0 max-h-32" viewportClassName="px-3 py-2">
            {presetSection}
          </CustomScrollArea>
        )}
        <CustomScrollArea className="flex-1" viewportClassName="px-4 py-3" contentClassName="space-y-3">
          {chatMessages}
        </CustomScrollArea>
        {conceptsBar}
        {inputBar}
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200 bg-white flex flex-col shrink-0" style={{ height }}>
      <div className="flex items-center justify-center py-1 cursor-ns-resize hover:bg-zinc-50 shrink-0 border-b border-zinc-100" onMouseDown={handleResizeStart}>
        <GripHorizontal className="w-4 h-4 text-zinc-400" />
      </div>
      <CustomScrollArea className="flex-1" viewportClassName="px-4 py-3" contentClassName="space-y-3">
        {chatMessages}
      </CustomScrollArea>
      {conceptsBar}
      {inputBar}
    </div>
  );
}
