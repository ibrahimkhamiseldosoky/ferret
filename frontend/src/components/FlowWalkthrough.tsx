'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Play, Pause, SkipForward, X } from 'lucide-react';
import type { SubGraph, GraphNode } from '@/types';

interface Props {
  graph: SubGraph;
  nodes: GraphNode[];
  onClose: () => void;
  onHighlight: (nodeIds: string[], edgeIndices: number[]) => void;
  onComplete?: () => void;
}

function resolveSubGraphToMainIds(graph: SubGraph, mainNodes: GraphNode[]): string[] {
  const ids: string[] = [];
  for (const sgNode of graph.nodes) {
    let match = mainNodes.find((n) => n.label === sgNode.label);
    if (!match) match = mainNodes.find((n) => n.label.toLowerCase() === sgNode.label.toLowerCase());
    if (!match) {
      const slug = sgNode.id.split(':').pop();
      if (slug) match = mainNodes.find((n) => n.label.toLowerCase().includes(slug.toLowerCase()));
    }
    if (match) ids.push(match.node_id);
  }
  return ids;
}

export default function FlowWalkthrough({ graph, nodes, onClose, onHighlight, onComplete }: Props) {
  const mainNodeIds = useMemo(() => resolveSubGraphToMainIds(graph, nodes), [graph, nodes]);

  const steps = useMemo(() => {
    const result: { nodeIds: string[]; edgeIdx: number | null; label: string }[] = [];
    const orderedNodes = graph.nodes;
    for (let i = 0; i < orderedNodes.length; i++) {
      result.push({
        nodeIds: orderedNodes.slice(0, i + 1).map((n) => n.id),
        edgeIdx: i > 0 ? i - 1 : null,
        label: orderedNodes[i].label,
      });
      if (i < graph.edges.length) {
        result.push({
          nodeIds: orderedNodes.slice(0, i + 1).map((n) => n.id),
          edgeIdx: i,
          label: graph.edges[i]?.label || '→',
        });
      }
    }
    return result;
  }, [graph]);

  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  const applyStep = useCallback(
    (idx: number) => {
      const step = steps[idx];
      if (!step) return;

      const highlightedMainIds: string[] = [];
      for (const sgId of step.nodeIds) {
        const sgNode = graph.nodes.find((n) => n.id === sgId);
        if (!sgNode) continue;
        let match = nodes.find((n) => n.label === sgNode.label);
        if (!match) match = nodes.find((n) => n.label.toLowerCase().includes(sgNode.label.toLowerCase()));
        if (match) highlightedMainIds.push(match.node_id);
      }

      onHighlight(highlightedMainIds, step.edgeIdx != null ? [step.edgeIdx] : []);
    },
    [steps, graph, nodes, onHighlight]
  );

  useEffect(() => {
    applyStep(stepIdx);
  }, [stepIdx, applyStep]);

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const timer = setInterval(() => {
      setStepIdx((prev) => {
        if (prev >= steps.length - 1) {
          setPlaying(false);
          onComplete?.();
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [playing, steps.length, onComplete]);

  const currentStep = steps[stepIdx];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(480px,calc(100%-2rem))] rounded-xl border border-indigo-200 bg-white/95 backdrop-blur-md shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-100 bg-indigo-50/80">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-indigo-900 truncate">{graph.title}</p>
          <p className="text-[10px] text-indigo-600/70 uppercase tracking-wider">{graph.type.replace('_', ' ')}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-indigo-100 transition-colors">
          <X className="w-3.5 h-3.5 text-indigo-400" />
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          {graph.nodes.map((n, i) => {
            const active = currentStep?.nodeIds.includes(n.id);
            return (
              <div key={n.id} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`shrink-0 w-2 h-2 rounded-full transition-all duration-300 ${
                    active ? 'bg-indigo-500 scale-150' : 'bg-zinc-300'
                  }`}
                />
                <span className={`text-[10px] truncate ${active ? 'text-indigo-700 font-medium' : 'text-zinc-400'}`}>
                  {n.label}
                </span>
                {i < graph.nodes.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded ${active ? 'bg-indigo-300' : 'bg-zinc-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-zinc-600">
          Step {stepIdx + 1}/{steps.length}: <span className="font-medium">{currentStep?.label}</span>
        </p>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100 bg-zinc-50/50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPlaying(!playing)}
            className="p-1.5 rounded-md hover:bg-zinc-200 transition-colors"
          >
            {playing ? <Pause className="w-3.5 h-3.5 text-zinc-600" /> : <Play className="w-3.5 h-3.5 text-zinc-600" />}
          </button>
          <button
            onClick={() => setStepIdx((p) => Math.min(p + 1, steps.length - 1))}
            disabled={stepIdx >= steps.length - 1}
            className="p-1.5 rounded-md hover:bg-zinc-200 transition-colors disabled:opacity-40"
          >
            <SkipForward className="w-3.5 h-3.5 text-zinc-600" />
          </button>
        </div>
        <span className="text-[10px] text-zinc-400">{mainNodeIds.length} nodes in main graph</span>
      </div>
    </div>
  );
}

export { resolveSubGraphToMainIds };
