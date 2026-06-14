'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { Folder, FolderOpen, ChevronRight } from 'lucide-react';

export default function DirectoryNode({ id, data }: NodeProps) {
  const isCollapsed = data.collapsed;

  return (
    <div
      onClick={() => data.onToggle?.(id)}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer
        select-none transition-all text-xs
        ${isCollapsed
          ? 'bg-zinc-100 border-zinc-300'
          : 'bg-zinc-50 border-dashed border-zinc-300'
        }
      `}
      style={{ minWidth: isCollapsed ? 120 : 160 }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0 !pointer-events-none" />
      {isCollapsed
        ? <Folder className="w-4 h-4 text-amber-500 shrink-0" />
        : <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
      }
      <span className="font-medium text-zinc-700 truncate">
        {data.label}
      </span>
      {isCollapsed && data.childCount > 0 && (
        <span className="text-[10px] text-zinc-400 bg-zinc-200 px-1.5 py-0.5 rounded-full ml-auto shrink-0">
          {data.childCount}
        </span>
      )}
      <ChevronRight className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${
        !isCollapsed ? 'rotate-90' : ''
      }`} />
      <Handle type="source" position={Position.Bottom} className="!opacity-0 !pointer-events-none" />
    </div>
  );
}
