'use client';

import { useMemo } from 'react';
import type { GraphNode, GraphEdge } from '@/types';

interface Props {
  centerId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxHops?: number;
  onNodeClick?: (nodeId: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  file: '#38bdf8',
  service: '#4ade80',
  api: '#facc15',
  database: '#f472b6',
  event: '#a78bfa',
  external: '#a1a1aa',
};

export default function MiniDependencyGraph({ centerId, nodes, edges, maxHops = 2, onNodeClick }: Props) {
  const { graphNodes, graphEdges } = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.node_id, n]));
    const included = new Set<string>([centerId]);
    let frontier = new Set([centerId]);

    for (let hop = 0; hop < maxHops; hop++) {
      const next = new Set<string>();
      for (const e of edges) {
        if (frontier.has(e.source_id)) {
          included.add(e.target_id);
          next.add(e.target_id);
        }
        if (frontier.has(e.target_id)) {
          included.add(e.source_id);
          next.add(e.source_id);
        }
      }
      frontier = next;
    }

    const ids = Array.from(included).slice(0, 12);
    const idSet = new Set(ids);
    const centerIdx = ids.indexOf(centerId);

    const w = 280;
    const h = 120;
    const positions = new Map<string, { x: number; y: number }>();

    ids.forEach((id, i) => {
      if (id === centerId) {
        positions.set(id, { x: w / 2, y: h / 2 });
      } else {
        const angle = ((i - (centerIdx >= 0 ? centerIdx : 0)) / Math.max(ids.length - 1, 1)) * Math.PI * 1.6 - Math.PI * 0.8;
        const radius = id === centerId ? 0 : 42 + (i % 2) * 12;
        positions.set(id, {
          x: w / 2 + Math.cos(angle) * radius,
          y: h / 2 + Math.sin(angle) * radius * 0.7,
        });
      }
    });

    const gNodes = ids
      .map((id) => {
        const n = nodeMap.get(id);
        if (!n) return null;
        const pos = positions.get(id)!;
        return { id, label: n.label, type: n.type, x: pos.x, y: pos.y, isCenter: id === centerId };
      })
      .filter(Boolean) as { id: string; label: string; type: string; x: number; y: number; isCenter: boolean }[];

    const gEdges = edges
      .filter((e) => idSet.has(e.source_id) && idSet.has(e.target_id))
      .slice(0, 16)
      .map((e) => ({ source: e.source_id, target: e.target_id }));

    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [centerId, nodes, edges, maxHops]);

  if (graphNodes.length <= 1) return null;

  const nodeById = new Map(graphNodes.map((n) => [n.id, n]));

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-2">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Dependencies</p>
      <svg viewBox="0 0 280 120" className="w-full h-[120px]">
        {graphEdges.map((e, i) => {
          const src = nodeById.get(e.source);
          const tgt = nodeById.get(e.target);
          if (!src || !tgt) return null;
          return (
            <line
              key={i}
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke="#cbd5e1"
              strokeWidth={1.5}
              markerEnd="url(#mini-arrow)"
            />
          );
        })}
        <defs>
          <marker id="mini-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
          </marker>
        </defs>
        {graphNodes.map((n) => (
          <g
            key={n.id}
            className={onNodeClick ? 'cursor-pointer' : ''}
            onClick={() => onNodeClick?.(n.id)}
          >
            <ellipse
              cx={n.x}
              cy={n.y}
              rx={n.isCenter ? 36 : 28}
              ry={n.isCenter ? 14 : 11}
              fill={`${TYPE_COLORS[n.type] || '#a1a1aa'}${n.isCenter ? '40' : '25'}`}
              stroke={TYPE_COLORS[n.type] || '#a1a1aa'}
              strokeWidth={n.isCenter ? 2 : 1.5}
            />
            <text
              x={n.x}
              y={n.y + 3}
              textAnchor="middle"
              className="fill-zinc-700"
              style={{ fontSize: n.isCenter ? 9 : 8, fontWeight: n.isCenter ? 600 : 500 }}
            >
              {n.label.length > 14 ? `${n.label.slice(0, 12)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
