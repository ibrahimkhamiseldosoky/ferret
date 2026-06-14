'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft, Crosshair, AlertTriangle, FunctionSquare } from 'lucide-react';
import CustomScrollArea from './CustomScrollArea';
import { getNodeSymbols, getCallChain } from '@/lib/api';
import type { GraphNode, GraphEdge, ImpactResult, FunctionSymbol, ClassSymbol, CallChainResponse } from '@/types';

interface Props {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  repositoryId: string;
  onClose: () => void;
  onNodeNavigate?: (nodeId: string) => void;
  onFocusNode?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
  impactResult?: ImpactResult | null;
  impactLoading?: boolean;
  onRunImpact?: (nodeId: string) => void;
  onClearImpact?: () => void;
  onHighlightNodes?: (nodeIds: string[]) => void;
  onClearHighlight?: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  file: '#38bdf8',
  service: '#4ade80',
  api: '#facc15',
  database: '#f472b6',
  event: '#a78bfa',
  external: '#a1a1aa',
};

export default function InfoPanel({ node, nodes, edges, repositoryId, onClose, onNodeNavigate, onFocusNode, focusedNodeId, impactResult, impactLoading, onRunImpact, onClearImpact, onHighlightNodes, onClearHighlight }: Props) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) map.set(n.node_id, n);
    return map;
  }, [nodes]);

  const outgoing = useMemo(
    () =>
      edges
        .filter((e) => e.source_id === node.node_id)
        .map((e) => ({ id: e.target_id, label: nodeMap.get(e.target_id)?.label || e.target_id, via: e.label })),
    [edges, node, nodeMap]
  );

  const incoming = useMemo(
    () =>
      edges
        .filter((e) => e.target_id === node.node_id)
        .map((e) => ({ id: e.source_id, label: nodeMap.get(e.source_id)?.label || e.source_id, via: e.label })),
    [edges, node, nodeMap]
  );

  const metrics = node.data || {};

  const [symbols, setSymbols] = useState<{ functions: FunctionSymbol[]; classes: ClassSymbol[] } | null>(null);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [callChain, setCallChain] = useState<CallChainResponse | null>(null);
  const [callChainLoading, setCallChainLoading] = useState(false);

  const loadSymbols = useCallback(async () => {
    if (!node.node_id.startsWith('file:')) return;
    setSymbolsLoading(true);
    setSymbols(null);
    setSelectedFn(null);
    setCallChain(null);
    onClearHighlight?.();
    try {
      const res = await getNodeSymbols(repositoryId, node.node_id);
      setSymbols({ functions: res.functions, classes: res.classes });
    } catch {
      // silent
    } finally {
      setSymbolsLoading(false);
    }
  }, [node.node_id]);

  useEffect(() => {
    loadSymbols();
  }, [loadSymbols]);

  const handleSelectFn = useCallback(async (fnName: string) => {
    setSelectedFn(fnName);
    setCallChainLoading(true);
    setCallChain(null);
    try {
      const res = await getCallChain(repositoryId, node.node_id, fnName);
      setCallChain(res);
      if (res.highlighted_node_ids.length > 0) {
        onHighlightNodes?.(res.highlighted_node_ids);
      }
    } catch {
      // silent
    } finally {
      setCallChainLoading(false);
    }
  }, [repositoryId, node.node_id, onHighlightNodes]);

  const handleBackToSymbols = useCallback(() => {
    setSelectedFn(null);
    setCallChain(null);
    onClearHighlight?.();
  }, [onClearHighlight]);

  const selectedFnData = useMemo(() => {
    if (!selectedFn || !symbols) return null;
    return symbols.functions.find((f) => f.name === selectedFn) || null;
  }, [selectedFn, symbols]);

  return (
    <aside className="fixed right-0 top-0 bottom-0 w-72 border-l border-zinc-200 bg-white/95 backdrop-blur-sm flex flex-col z-10 shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[node.type] || '#a1a1aa' }} />
          <h3 className="font-semibold text-sm text-zinc-900 truncate">{node.label}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onFocusNode && (
            focusedNodeId === node.node_id ? (
              <button
                onClick={() => onFocusNode(null)}
                className="p-1 rounded-md hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
                title="Exit focus mode"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => onFocusNode(node.node_id)}
                className="p-1 rounded-md hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
                title="Isolate this node"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            )
          )}
          <button onClick={onClose} className="p-1 rounded-md hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      <CustomScrollArea className="flex-1" viewportClassName="p-4 text-sm" contentClassName="space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
            style={{ background: `${TYPE_COLORS[node.type] || '#a1a1aa'}20`, color: TYPE_COLORS[node.type] || '#52525b' }}
          >
            {node.type}
          </span>
          {(metrics.importCount != null || metrics.symbolCount != null) && (
            <span className="text-[10px] text-zinc-400">
              {metrics.importCount != null && `${metrics.importCount} imports`}
              {metrics.importCount != null && metrics.symbolCount != null && ' · '}
              {metrics.symbolCount != null && `${metrics.symbolCount} symbols`}
            </span>
          )}
        </div>

        {impactResult ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800">Impact Analysis</span>
              </div>
              <button
                onClick={() => onClearImpact?.()}
                className="p-0.5 rounded hover:bg-amber-100 transition-colors"
              >
                <X className="w-3 h-3 text-amber-500" />
              </button>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Risk</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  impactResult.risk === 'High' ? 'bg-red-100 text-red-700' :
                  impactResult.risk === 'Medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {impactResult.risk}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Affected files</span>
                <span className="text-xs font-bold text-zinc-700">{impactResult.total_affected}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Max dependency depth</span>
                <span className="text-xs font-bold text-zinc-700">{impactResult.dependency_depth}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase">Confidence</span>
                <span className="text-xs font-bold text-zinc-700">{Math.round(impactResult.confidence * 100)}%</span>
              </div>
              {impactResult.affected_features.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1.5">Affected features</span>
                  <div className="flex flex-wrap gap-1">
                    {impactResult.affected_features.map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded bg-amber-100 text-[10px] text-amber-700 font-medium">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {impactResult.affected_files.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1.5">Impacted files</span>
                  <ul className="space-y-1">
                    {impactResult.affected_files.map((f) => (
                      <li key={f.node_id}>
                        <button
                          onClick={() => onNodeNavigate?.(f.node_id)}
                          className="w-full text-left flex items-center gap-1.5 p-1 rounded hover:bg-amber-100/50 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-400" />
                          <span className="text-xs text-zinc-700 truncate">{f.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => onRunImpact?.(node.node_id)}
            disabled={impactLoading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors bg-white"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {impactLoading ? 'Analyzing impact...' : 'What breaks if I change this?'}
          </button>
        )}

        {symbols && node.node_id.startsWith('file:') && (symbols.functions.length > 0 || symbols.classes.length > 0) && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FunctionSquare className="w-3 h-3" />
              Symbols
            </h4>
            {selectedFnData ? (
              <div className="space-y-2">
                <button
                  onClick={handleBackToSymbols}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  &larr; All symbols
                </button>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2.5">
                  <p className="text-xs font-semibold text-indigo-900">{selectedFn}</p>
                  <div className="mt-2 space-y-1.5">
                    {callChainLoading && (
                      <p className="text-[10px] text-zinc-400 italic">Resolving call chain...</p>
                    )}
                    {!callChainLoading && callChain && callChain.chain.length > 0 && (
                      <div>
                        <p className="text-[9px] font-semibold text-indigo-600 uppercase tracking-wider mb-1.5">Cross-file call chain</p>
                        <div className="space-y-1">
                          {callChain.chain.map((item, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="text-[9px] text-zinc-400 font-mono w-4 text-right">{i + 1}.</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] text-zinc-700 font-mono">{item.callee_func}</span>
                                {item.callee_node_id != null && (
                                  <button
                                    onClick={() => onNodeNavigate?.(item.callee_node_id!)}
                                    className="text-[9px] text-indigo-600 hover:text-indigo-800 truncate max-w-[120px] border-b border-dotted border-indigo-300"
                                  >
                                    {item.callee_label}
                                  </button>
                                )}
                                {!item.callee_node_id && (
                                  <span className="text-[9px] text-zinc-400 italic">{item.callee_label}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!callChainLoading && callChain && callChain.chain.length === 0 && (
                      <p className="text-[10px] text-zinc-500 italic">No cross-file calls found</p>
                    )}
                    {!callChainLoading && !callChain && selectedFnData.calls.length > 0 && (
                      <div>
                        <p className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Local calls</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedFnData.calls.map((c) => (
                            <span key={c.name} className="px-1.5 py-0.5 rounded bg-zinc-100 text-[10px] text-zinc-700 font-medium">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedFnData.calls.length === 0 && selectedFnData.called_by.length === 0 && !callChainLoading && (
                      <p className="text-[10px] text-zinc-500 italic mt-1">No call relationships found</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {symbols.functions.map((fn) => (
                  <button
                    key={fn.name}
                    onClick={() => handleSelectFn(fn.name)}
                    className="w-full text-left flex items-center gap-2 p-1.5 rounded-md hover:bg-zinc-50 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span className="text-xs text-zinc-700 font-mono">{fn.name}</span>
                    {fn.calls.length > 0 && (
                      <span className="ml-auto text-[9px] text-zinc-400 font-medium">{fn.calls.length} calls</span>
                    )}
                    {fn.called_by && fn.called_by.length > 0 && (
                      <span className="text-[9px] text-zinc-400 ml-1">({fn.called_by.length} callers)</span>
                    )}
                  </button>
                ))}
                {symbols.classes.map((cls) => (
                  <div key={cls.name} className="space-y-0.5">
                    <div className="flex items-center gap-2 p-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-xs text-zinc-700 font-mono font-semibold">{cls.name}</span>
                      {cls.methods.length > 0 && (
                        <span className="ml-auto text-[9px] text-zinc-400">{cls.methods.length} methods</span>
                      )}
                    </div>
                    {cls.methods.map((m) => (
                      <button
                        key={m.name}
                        onClick={() => handleSelectFn(m.name)}
                        className="w-full text-left flex items-center gap-2 pl-6 pr-1.5 py-1 rounded-md hover:bg-zinc-50 transition-colors"
                      >
                        <span className="w-1 h-1 rounded-full bg-emerald-300 shrink-0" />
                        <span className="text-[11px] text-zinc-600 font-mono">{m.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {outgoing.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3" />
              Depends on
            </h4>
            <ul className="space-y-1.5">
              {outgoing.map((dep) => (
                <li key={dep.id}>
                  <button
                    onClick={() => onNodeNavigate?.(dep.id)}
                    className="w-full text-left flex flex-col p-1.5 rounded-md hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-zinc-800 font-medium text-xs">{dep.label}</span>
                    {dep.via && <span className="text-zinc-400 text-[10px]">via {dep.via}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {incoming.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ArrowLeft className="w-3 h-3" />
              Depended on by
            </h4>
            <ul className="space-y-1.5">
              {incoming.map((dep) => (
                <li key={dep.id}>
                  <button
                    onClick={() => onNodeNavigate?.(dep.id)}
                    className="w-full text-left flex flex-col p-1.5 rounded-md hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-zinc-800 font-medium text-xs">{dep.label}</span>
                    {dep.via && <span className="text-zinc-400 text-[10px]">via {dep.via}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {outgoing.length === 0 && incoming.length === 0 && (
          <p className="text-zinc-400 italic text-xs">No connections</p>
        )}
      </CustomScrollArea>
    </aside>
  );
}
