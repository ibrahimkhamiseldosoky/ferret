'use client';

import { Search, X } from 'lucide-react';

export type NodeTypeFilter = 'all' | 'service' | 'api' | 'database' | 'file' | 'event' | 'external';

interface GraphControlsProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: NodeTypeFilter;
  onFilterChange: (f: NodeTypeFilter) => void;
  nodeCount: number;
  visibleCount: number;
}

const FILTERS: { value: NodeTypeFilter; label: string; color: string }[] = [
  { value: 'all',      label: 'All',       color: '' },
  { value: 'service',  label: 'Services',  color: 'bg-green-500/15 text-green-700 border-green-300' },
  { value: 'api',      label: 'APIs',      color: 'bg-yellow-500/15 text-yellow-700 border-yellow-300' },
  { value: 'database', label: 'Databases', color: 'bg-pink-500/15 text-pink-700 border-pink-300' },
  { value: 'file',     label: 'Files',     color: 'bg-blue-500/15 text-blue-700 border-blue-300' },
  { value: 'event',    label: 'Events',    color: 'bg-purple-500/15 text-purple-700 border-purple-300' },
  { value: 'external', label: 'External',  color: 'bg-zinc-500/15 text-zinc-700 border-zinc-300' },
];

export default function GraphControls({
  searchQuery, onSearchChange,
  activeFilter, onFilterChange,
  nodeCount, visibleCount,
}: GraphControlsProps) {
  const hasActiveFilter = activeFilter !== 'all';
  const hasSearch = searchQuery.length > 0;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2
                    bg-white/90 backdrop-blur-sm border border-zinc-200
                    rounded-lg px-3 py-2 shadow-sm">
      <div className="relative flex items-center">
        <Search className="absolute left-2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-7 pr-6 py-1 text-sm bg-zinc-100 rounded-md
                     border-0 outline-none focus:ring-1 focus:ring-indigo-500 w-48"
        />
        {hasSearch && (
          <button onClick={() => onSearchChange('')}
            className="absolute right-1.5 text-zinc-400 hover:text-zinc-600">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="w-px h-5 bg-zinc-200" />

      <div className="flex items-center gap-1">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-2.5 py-0.5 text-xs rounded-full border transition-all
              ${activeFilter === f.value
                ? f.color || 'bg-zinc-800 text-white border-zinc-800'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-200'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(hasSearch || hasActiveFilter) && (
        <>
          <div className="w-px h-5 bg-zinc-200" />
          <span className="text-xs text-zinc-500 whitespace-nowrap">
            {visibleCount} / {nodeCount}
          </span>
        </>
      )}
    </div>
  );
}
