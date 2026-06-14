'use client';

import { useState } from 'react';
import { Pin, PinOff, Lightbulb } from 'lucide-react';

interface Props {
  concepts: string[];
  onAsk: (question: string) => void;
}

export default function ConceptsBar({ concepts, onAsk }: Props) {
  const [pinned, setPinned] = useState(true);

  if (!pinned) {
    return (
      <div className="px-4 py-1.5 border-t border-zinc-100 shrink-0">
        <button
          onClick={() => setPinned(true)}
          className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <PinOff className="w-3 h-3" />
          Show concepts
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 shrink-0">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Core concepts</span>
          </div>
          <button
            onClick={() => setPinned(false)}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <Pin className="w-3 h-3" />
            Unpin
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {concepts.map((concept) => (
            <button
              key={concept}
              onClick={() => onAsk(`Explain ${concept} in this codebase`)}
              className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-[10px] text-amber-700 font-medium hover:bg-amber-100 transition-colors"
            >
              {concept}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
