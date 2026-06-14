'use client';

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export interface AnalysisStats {
  filesFound?: number;
  languages?: Record<string, number>;
  nodesBuilt?: number;
}

interface Props {
  currentStep: number;
  steps: string[];
  stats?: AnalysisStats;
  partialNodes?: number;
}

export default function AnalysisProgress({ currentStep, steps, stats, partialNodes }: Props) {
  return (
    <div className="space-y-4">
      {stats && (stats.filesFound != null || stats.languages || stats.nodesBuilt != null) && (
        <div className="rounded-lg border border-zinc-200 bg-white/80 p-3 space-y-2">
          {stats.filesFound != null && stats.filesFound > 0 && (
            <p className="text-xs text-zinc-600">
              Found <span className="font-semibold text-indigo-600">{stats.filesFound}</span> files
              {stats.languages && Object.keys(stats.languages).length > 0 && (
                <>
                  {' — '}
                  {Object.entries(stats.languages).map(([lang, count], i) => (
                    <span key={lang}>
                      {i > 0 && ', '}
                      <span className="font-medium">{count}</span> {lang}
                    </span>
                  ))}
                </>
              )}
            </p>
          )}
          {partialNodes != null && partialNodes > 0 && (
            <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
              Mapping {partialNodes} nodes into graph…
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={step} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              ) : (
                <Circle className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-500' : 'text-zinc-300'}`} />
              )}
              <span
                className={`text-sm ${
                  done ? 'text-zinc-500 line-through' : active ? 'text-indigo-700 font-medium' : 'text-zinc-400'
                }`}
              >
                {step}
              </span>
              {active && (
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse ml-auto shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
