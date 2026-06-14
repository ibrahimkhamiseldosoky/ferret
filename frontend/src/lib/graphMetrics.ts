import type { GraphNode, GraphEdge } from '@/types';

export type HeatMapMode = 'none' | 'imports' | 'connections';

export function computeNodeMetrics(nodes: GraphNode[], edges: GraphEdge[]) {
  const metrics = new Map<string, { imports: number; connections: number; size: number }>();

  for (const node of nodes) {
    const data = node.data || {};
    metrics.set(node.node_id, {
      imports: (data.importCount as number) ?? 0,
      connections: 0,
      size: (data.fileSize as number) ?? (data.symbolCount as number) ?? 0,
    });
  }

  for (const edge of edges) {
    const src = metrics.get(edge.source_id);
    const tgt = metrics.get(edge.target_id);
    if (src) src.connections += 1;
    if (tgt) tgt.connections += 1;
    if (src) src.imports += 1;
  }

  return metrics;
}

export function normalizeMetric(values: number[]): Map<number, number> {
  const map = new Map<number, number>();
  if (values.length === 0) return map;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  for (const v of values) {
    map.set(v, (v - min) / range);
  }
  return map;
}

export function getHeatIntensity(
  nodeId: string,
  mode: HeatMapMode,
  metrics: Map<string, { imports: number; connections: number; size: number }>
): number {
  if (mode === 'none') return 0;
  const m = metrics.get(nodeId);
  if (!m) return 0;
  switch (mode) {
    case 'imports':
      return m.imports;
    case 'connections':
      return m.connections;
    default:
      return 0;
  }
}

export function blendHeatColor(baseHex: string, intensity: number, alpha = 0.55): string {
  const t = Math.min(1, Math.max(0, intensity));
  const r = parseInt(baseHex.slice(1, 3), 16);
  const g = parseInt(baseHex.slice(3, 5), 16);
  const b = parseInt(baseHex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * (1 - t * alpha));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
