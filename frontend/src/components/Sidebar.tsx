'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, FolderCode, Server, Database, Zap, Globe } from 'lucide-react';
import CustomScrollArea from './CustomScrollArea';
import type { GraphNode } from '@/types';

const SECTION_ICONS: Record<string, React.ElementType> = {
  Services: Server,
  Files: FolderCode,
  APIs: Globe,
  Databases: Database,
  Events: Zap,
};

const TYPE_TO_SECTION: Record<string, string> = {
  service: 'Services',
  file: 'Files',
  api: 'APIs',
  database: 'Databases',
  event: 'Events',
};

interface Props {
  repoName: string;
  nodes: GraphNode[];
  onSelectNode: (node: GraphNode) => void;
}

export default function Sidebar({ repoName, nodes, onSelectNode }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const sections = useMemo(() => {
    const map: Record<string, GraphNode[]> = {};
    for (const node of nodes) {
      const section = TYPE_TO_SECTION[node.type] || 'Other';
      if (!map[section]) map[section] = [];
      map[section].push(node);
    }
    return map;
  }, [nodes]);

  const filtered = useMemo(() => {
    if (!search) return sections;
    const lower = search.toLowerCase();
    const result: Record<string, GraphNode[]> = {};
    for (const [key, items] of Object.entries(sections)) {
      const filteredItems = items.filter((n) => n.label.toLowerCase().includes(lower));
      if (filteredItems.length > 0) result[key] = filteredItems;
    }
    return result;
  }, [sections, search]);

  const toggle = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside className="w-60 border-r border-zinc-200 flex flex-col bg-zinc-50/50 shrink-0">
      <div className="p-4 border-b border-zinc-200">
        <h2 className="font-semibold text-sm text-zinc-900 truncate">{repoName}</h2>
      </div>
      <CustomScrollArea as="nav" className="flex-1" viewportClassName="p-2" contentClassName="space-y-1">
        {Object.entries(filtered).map(([section, items]) => {
          const Icon = SECTION_ICONS[section] || FolderCode;
          const isCollapsed = collapsed[section];
          return (
            <div key={section}>
              <button
                onClick={() => toggle(section)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <Icon className="w-3.5 h-3.5" />
                {section}
                <span className="ml-auto text-zinc-400">{items.length}</span>
              </button>
              {!isCollapsed && (
                <div className="ml-4 space-y-0.5">
                  {items.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => onSelectNode(node)}
                      className="block w-full text-left px-2 py-1 rounded text-xs text-zinc-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate"
                    >
                      {node.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CustomScrollArea>
      <div className="p-3 border-t border-zinc-200">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-md border border-zinc-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </aside>
  );
}
