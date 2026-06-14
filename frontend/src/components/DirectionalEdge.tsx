'use client';

import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow';

function DirectionalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const stroke = (style?.stroke as string) || '#94a3b8';
  const highlighted = data?.highlighted === true;
  const dimmed = data?.dimmed === true;

  return (
    <>
      <defs>
        <linearGradient id={`edge-grad-${id}`} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={stroke} stopOpacity={highlighted ? 1 : dimmed ? 0.15 : 0.7} />
          <stop offset="100%" stopColor={stroke} stopOpacity={highlighted ? 0.85 : dimmed ? 0.08 : 0.35} />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: `url(#edge-grad-${id})`,
          strokeWidth: highlighted ? 3 : dimmed ? 1 : 2,
          strokeLinecap: 'round',
        }}
      />
      <circle
        cx={sourceX}
        cy={sourceY}
        r={highlighted ? 5 : 3.5}
        fill={stroke}
        opacity={highlighted ? 1 : dimmed ? 0.2 : 0.55}
      />
    </>
  );
}

export default memo(DirectionalEdgeComponent);
