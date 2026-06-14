'use client';

import { useMemo, memo, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type Edge as RFEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FileCode, Server, Globe, Database, Zap, Box, Layers } from 'lucide-react';
import type { GraphNode, GraphEdge } from '@/types';
import type { HeatMapMode } from '@/lib/graphMetrics';
import { computeNodeMetrics, normalizeMetric, getHeatIntensity, blendHeatColor } from '@/lib/graphMetrics';
import DirectionalEdge from './DirectionalEdge';
import DirectoryNode from './DirectoryNode';
import { X } from 'lucide-react';

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string; heat: string }> = {
  file: { bg: '#f0f9ff', border: '#38bdf8', text: '#0369a1', heat: '#0ea5e9' },
  service: { bg: '#f0fdf4', border: '#4ade80', text: '#15803d', heat: '#22c55e' },
  api: { bg: '#fefce8', border: '#facc15', text: '#a16207', heat: '#eab308' },
  database: { bg: '#fdf2f8', border: '#f472b6', text: '#be185d', heat: '#ec4899' },
  event: { bg: '#f5f3ff', border: '#a78bfa', text: '#6d28d9', heat: '#8b5cf6' },
  external: { bg: '#fafafa', border: '#a1a1aa', text: '#52525b', heat: '#71717a' },
};

const TYPE_ICONS: Record<string, typeof FileCode> = {
  file: FileCode,
  service: Server,
  api: Globe,
  database: Database,
  event: Zap,
  external: Box,
};

function CustomNode({ data }: NodeProps) {
  const colors = TYPE_COLORS[data.nodeType] || TYPE_COLORS.external;
  const Icon = TYPE_ICONS[data.nodeType] || Box;
  const bg = data.heatIntensity > 0 ? blendHeatColor(colors.heat, data.heatIntensity) : colors.bg;

  return (
    <div
      className={`rounded-full shadow-sm border-2 px-4 py-2.5 min-w-[120px] max-w-[180px] transition-all duration-300 cursor-pointer ${
        data.pulsing ? 'ring-2 ring-indigo-400 ring-offset-2 animate-pulse' : ''
      } ${data.selected ? 'shadow-md ring-2 ring-indigo-500/50' : data.connected ? 'ring-2 ring-indigo-400/40' : 'hover:shadow-md'}`}
      style={{
        background: bg,
        borderColor: colors.border,
        opacity: data.opacity ?? 1,
        borderWidth: data.heatIntensity > 0.6 ? 3 : 2,
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0 !opacity-0" />
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: colors.text }} />
        <p className="text-xs font-medium leading-tight truncate" style={{ color: colors.text }}>
          {data.label}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-0 !opacity-0" />
    </div>
  );
}

const nodeTypes = { custom: CustomNode, directory: DirectoryNode };
const edgeTypes = { directional: DirectionalEdge };

interface InnerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  aiHighlightNodes?: string[] | null;
  aiHighlightEdges?: string[] | null;
  focusNodeId?: string | null;
  focusedNodeId?: string | null;
  heatMapMode?: HeatMapMode;
  pulsingNodeIds?: string[] | null;
  dimmedNodeIds?: Set<string> | null;
  revealProgress?: number;
  collapsedDirs?: Set<string>;
  onNodeClick: (node: GraphNode | null) => void;
  onAiReset?: () => void;
  onHeatMapModeChange?: (mode: HeatMapMode) => void;
  onToggleDir?: (dirId: string) => void;
}

function GraphInner({
  nodes, edges, selectedNodeId, aiHighlightNodes, aiHighlightEdges, focusNodeId, focusedNodeId,
  heatMapMode = 'none', pulsingNodeIds, dimmedNodeIds, revealProgress = 1,
  collapsedDirs, onNodeClick, onAiReset, onHeatMapModeChange, onToggleDir,
}: InnerProps) {
  const { fitView, setCenter, getNodes } = useReactFlow();

  const metrics = useMemo(() => computeNodeMetrics(nodes, edges), [nodes, edges]);

  const heatNorm = useMemo(() => {
    if (heatMapMode === 'none') return new Map<number, number>();
    const values = nodes.map((n) => getHeatIntensity(n.node_id, heatMapMode, metrics));
    return normalizeMetric(values);
  }, [nodes, metrics, heatMapMode]);

  const { connectionIds, activeHighlight } = useMemo(() => {
    if (aiHighlightNodes && aiHighlightNodes.length > 0) {
      const ids = new Set(aiHighlightNodes);
      for (const e of edges) {
        if (ids.has(e.source_id)) ids.add(e.target_id);
        if (ids.has(e.target_id)) ids.add(e.source_id);
      }
      return { connectionIds: ids, activeHighlight: 'ai' as const };
    }
    if (selectedNodeId) {
      const ids = new Set([selectedNodeId]);
      for (const e of edges) {
        if (e.source_id === selectedNodeId) ids.add(e.target_id);
        if (e.target_id === selectedNodeId) ids.add(e.source_id);
      }
      return { connectionIds: ids, activeHighlight: 'click' as const };
    }
    return { connectionIds: null, activeHighlight: null };
  }, [aiHighlightNodes, selectedNodeId, edges]);

  const fitToNode = useCallback(
    (nodeId: string) => {
      const connectedIds = new Set([nodeId]);
      for (const e of edges) {
        if (e.source_id === nodeId) connectedIds.add(e.target_id);
        if (e.target_id === nodeId) connectedIds.add(e.source_id);
      }
      const rfNodes = getNodes().filter((n) => connectedIds.has(n.id));
      if (rfNodes.length > 0) {
        fitView({ nodes: rfNodes, duration: 400, padding: 0.35, maxZoom: 1.5 });
        return;
      }
      const positioned = nodes.filter((n) => connectedIds.has(n.node_id) && n.position);
      if (positioned.length === 0) return;
      const xs = positioned.map((n) => n.position!.x);
      const ys = positioned.map((n) => n.position!.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      setCenter((minX + maxX) / 2 + 70, (minY + maxY) / 2 + 20, { zoom: 1, duration: 400 });
    },
    [edges, nodes, getNodes, fitView, setCenter]
  );

  useEffect(() => {
    const targetId = focusNodeId || selectedNodeId;
    if (!targetId) return;
    const t = setTimeout(() => fitToNode(targetId), 50);
    return () => clearTimeout(t);
  }, [focusNodeId, selectedNodeId, fitToNode]);

  const highlightedEdgeSet = useMemo(() => {
    if (aiHighlightEdges && aiHighlightEdges.length > 0) return new Set(aiHighlightEdges);
    return null;
  }, [aiHighlightEdges]);

  const pulsingSet = useMemo(() => new Set(pulsingNodeIds || []), [pulsingNodeIds]);

  const focusedNeighborIds = useMemo(() => {
    if (!focusedNodeId) return null;
    const ids = new Set<string>([focusedNodeId]);
    for (const e of edges) {
      if (e.source_id === focusedNodeId) ids.add(e.target_id);
      if (e.target_id === focusedNodeId) ids.add(e.source_id);
    }
    return ids;
  }, [focusedNodeId, edges]);

  const flowNodes = useMemo(() => {
    const revealCount = Math.ceil(nodes.length * revealProgress);
    return nodes.slice(0, revealCount).map((n, idx) => {
      if ((n.type as string) === 'directory') {
        return {
          id: n.node_id,
          type: 'directory' as const,
          position: n.position || { x: 0, y: 0 },
          data: {
            label: n.label,
            collapsed: collapsedDirs?.has(n.node_id) ?? false,
            childCount: (n.data?.childCount as number) ?? 0,
            onToggle: onToggleDir,
          },
        };
      }
      const isDimmed = dimmedNodeIds != null && !dimmedNodeIds.has(n.node_id);
      const isFocusedOut = focusedNeighborIds != null && !focusedNeighborIds.has(n.node_id);
      const rawHeat = getHeatIntensity(n.node_id, heatMapMode, metrics);
      const heatIntensity = heatMapMode === 'none' ? 0 : heatNorm.get(rawHeat) ?? 0;

      let opacity = 1;
      if (isFocusedOut) opacity = 0.04;
      else if (isDimmed) opacity = 0.15;

      return {
        id: n.node_id,
        type: 'custom' as const,
        position: n.position?.x != null ? n.position : { x: (idx % 5) * 240 + 40, y: Math.floor(idx / 5) * 160 + 40 },
        data: {
          label: n.label,
          nodeType: n.type,
          opacity,
          heatIntensity,
          pulsing: pulsingSet.has(n.node_id),
          selected: n.node_id === selectedNodeId,
          connected: connectionIds != null && connectionIds.has(n.node_id) && n.node_id !== selectedNodeId,
        },
      };
    });
  }, [nodes, dimmedNodeIds, heatMapMode, metrics, heatNorm, pulsingSet, selectedNodeId, connectionIds, revealProgress, collapsedDirs, onToggleDir, focusedNeighborIds]);

  const flowEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => {
        let isHighlighted = false;
        if (highlightedEdgeSet) {
          isHighlighted = highlightedEdgeSet.has(e.id);
        } else if (connectionIds) {
          isHighlighted = connectionIds.has(e.source_id) && connectionIds.has(e.target_id);
        }
        const isFocusedOut = focusedNeighborIds != null &&
          (!focusedNeighborIds.has(e.source_id) || !focusedNeighborIds.has(e.target_id));
        const isFilteredOut = dimmedNodeIds != null &&
          (!dimmedNodeIds.has(e.source_id) || !dimmedNodeIds.has(e.target_id));

        let edgeOpacity = 1;
        if (isFocusedOut) edgeOpacity = 0.03;
        else if (isFilteredOut) edgeOpacity = 0.08;

        return {
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: e.label,
          type: 'directional',
          animated: isHighlighted,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: isHighlighted ? '#6366f1' : '#94a3b8' },
          data: { highlighted: isHighlighted, dimmed: isFilteredOut && !isFocusedOut },
          style: {
            stroke: isHighlighted ? '#6366f1' : '#94a3b8',
            opacity: edgeOpacity,
          },
        };
      }),
    [edges, connectionIds, highlightedEdgeSet, focusedNeighborIds, dimmedNodeIds]
  );

  useEffect(() => {
    if (nodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 200);
      return () => clearTimeout(t);
    }
  }, [nodes.length, fitView]);

  const heatModes: { mode: HeatMapMode; label: string }[] = [
    { mode: 'none', label: 'Off' },
    { mode: 'connections', label: 'Connections' },
    { mode: 'imports', label: 'Imports' },
  ];

  return (
    <div className="w-full h-full relative ferret-graph-canvas">
      {activeHighlight === 'ai' && (
        <button
          onClick={onAiReset}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/90 border border-zinc-200 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50 transition-colors backdrop-blur-sm"
        >
          <X className="w-3.5 h-3.5" />
          Reset view
        </button>
      )}
      {onHeatMapModeChange && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 p-1 rounded-lg bg-white/90 border border-zinc-200 shadow-sm backdrop-blur-sm">
          <Layers className="w-3.5 h-3.5 text-zinc-400 ml-1.5" />
          {heatModes.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => onHeatMapModeChange(mode)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                heatMapMode === mode
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          const original = nodes.find((n) => n.node_id === node.id);
          if (original) onNodeClick(original);
        }}
        onPaneClick={() => onNodeClick(null)}
        fitView={false}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="#6366f1"
          gap={20}
          size={1}
          style={{ opacity: 0.08 }}
        />
        <Controls className="!rounded-lg !border !border-zinc-200 !shadow-sm !bg-white/90" />
        <MiniMap
          nodeStrokeWidth={0}
          nodeColor={(n) => {
            if (n.type === 'directory') return '#f59e0b';
            return TYPE_COLORS[n.data?.nodeType]?.heat || '#a1a1aa';
          }}
          maskColor="rgba(0,0,0,0.08)"
          pannable
          zoomable
          className="!rounded-lg !border !border-zinc-200 !shadow-sm !bg-white/90"
          style={{ width: 140, height: 96 }}
        />
      </ReactFlow>
    </div>
  );
}

interface Props extends InnerProps {}

const ArchitectureGraph = memo(function ArchitectureGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
});

export default ArchitectureGraph;
