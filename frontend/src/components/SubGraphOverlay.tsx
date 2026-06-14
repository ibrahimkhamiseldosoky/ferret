'use client';

import { useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, type Edge as RFEdge, type Node as RFNode } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { X, Maximize2 } from 'lucide-react';
import type { SubGraph as SubGraphType, GraphNode } from '@/types';

const TYPE_COLORS: Record<string, string> = {
  file: '#38bdf8',
  service: '#4ade80',
  api: '#facc15',
  database: '#f472b6',
  event: '#a78bfa',
  external: '#a1a1aa',
};

interface Props {
  graph: SubGraphType;
  nodes: GraphNode[];
  onClose: () => void;
  onViewInMain: (nodeIds: string[]) => void;
}

function layoutSubGraph(subGraph: SubGraphType): { nodes: SubGraphType['nodes']; edges: SubGraphType['edges'] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 80, marginx: 30, marginy: 30 });

  for (const n of subGraph.nodes) {
    const labelWidth = Math.max(110, n.label.length * 8.5 + 24);
    g.setNode(n.id, { width: labelWidth, height: 36 });
  }
  for (const e of subGraph.edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  const laidOut = subGraph.nodes.map((n) => {
    const dagreNode = g.node(n.id);
    return {
      ...n,
      x: dagreNode.x - 55,
      y: dagreNode.y - 18,
    };
  });

  return { nodes: laidOut, edges: subGraph.edges };
}

export default function SubGraphOverlay({ graph, nodes, onClose, onViewInMain }: Props) {
  const [position, setPosition] = useState({ x: 60, y: 60 });
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const { nodes: laidOutNodes } = useMemo(() => layoutSubGraph(graph), [graph]);

  const flowNodes: RFNode[] = useMemo(
    () =>
      laidOutNodes.map((n) => ({
        id: n.id,
        type: 'default' as const,
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        data: { label: n.label },
        style: {
          background: `${TYPE_COLORS[n.type] || '#a1a1aa'}20`,
          borderColor: TYPE_COLORS[n.type] || '#a1a1aa',
          borderWidth: 2,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          color: '#27272a',
          fontWeight: 500,
        },
      })),
    [laidOutNodes]
  );

  const flowEdges: RFEdge[] = useMemo(
    () =>
      graph.edges.map((e, i) => ({
        id: `sg-edge-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        labelStyle: { fontSize: 10, fill: '#6366f1' },
        labelBgStyle: { fill: '#fff' },
        labelBgPadding: [2, 2] as [number, number],
        labelBgBorderRadius: 2,
      })),
    [graph.edges]
  );

  const handleViewInMain = () => {
    const mainNodeIds: string[] = [];
    for (const sgNode of graph.nodes) {
      let match = nodes.find((n) => n.label === sgNode.label);
      if (!match) match = nodes.find((n) => n.label.toLowerCase().includes(sgNode.label.toLowerCase()));
      if (!match) {
        const slug = sgNode.id.split(':').pop();
        if (slug) match = nodes.find((n) => n.label.toLowerCase().includes(slug.toLowerCase()));
      }
      if (match) mainNodeIds.push(match.node_id);
    }
    if (mainNodeIds.length > 0) {
      onViewInMain(mainNodeIds);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: dragRef.current.offsetX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.offsetY + (ev.clientY - dragRef.current.startY),
      });
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const typeColors: Record<string, string> = {
    request_flow: '#6366f1',
    dependency_flow: '#0891b2',
    event_flow: '#d946ef',
    data_flow: '#059669',
  };

  return (
    <div
      className="fixed z-20 rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: 420, height: 400 }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 bg-zinc-50 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: typeColors[graph.type] || '#6366f1' }}
          />
          <span className="text-xs font-semibold text-zinc-700 truncate">{graph.title}</span>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{graph.type}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-zinc-200 transition-colors">
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
      <div className="h-[290px]">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView attributionPosition="bottom-left">
          <Background color="#e4e4e7" gap={16} />
        </ReactFlow>
      </div>
      <div className="flex items-center justify-end px-4 py-2 border-t border-zinc-100 bg-zinc-50">
        <button
          onClick={handleViewInMain}
          className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
          View in Main Graph
        </button>
      </div>
    </div>
  );
}
