'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { getRepositoryStatus } from '@/lib/api';
import AnalysisProgress from '@/components/AnalysisProgress';

const STEPS = [
  'Detecting languages',
  'Building AST',
  'Mapping dependencies',
  'Creating knowledge graph',
  'Generating architecture',
];

export default function RepoLoadingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [status, setStatus] = useState<string>('analyzing');
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ filesFound?: number; languages?: Record<string, number>; nodesBuilt?: number }>({});

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      try {
        const res = await getRepositoryStatus(id);
        setStatus(res.status);
        if (res.status === 'completed') {
          clearInterval(interval);
          router.refresh();
          return;
        }
        if (res.status === 'failed') {
          clearInterval(interval);
          setError('Analysis failed. Please try again.');
          return;
        }
        if (res.step != null) {
          setCurrentStep(res.step);
        } else if (res.progress !== undefined) {
          setCurrentStep(Math.min(Math.floor(res.progress * STEPS.length), STEPS.length - 1));
        } else {
          setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
        }
        if (res.stats) {
          setStats({
            filesFound: res.stats.files_found,
            languages: res.stats.languages,
            nodesBuilt: res.stats.nodes_built,
          });
        }
      } catch {
        setError('Lost connection to server.');
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [id, router]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400 text-sm font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 ferret-analysis-bg">
      <div className="max-w-md w-full px-6 text-center">
        <div className="mb-8 flex flex-col items-center">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-indigo-400/50 animate-spin" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Search className="w-7 h-7 text-indigo-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Ferret<span className="text-indigo-400">.</span>
          </h1>
        </div>
        <p className="text-sm text-zinc-400">Uncovering your codebase architecture…</p>
        <div className="mt-8 ferret-skeleton-graph rounded-xl border border-zinc-800 bg-zinc-900/50 h-32 mb-6 overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center gap-4 px-6">
            {[...Array(Math.min(stats.nodesBuilt || 3, 8))].map((_, i) => (
              <div
                key={i}
                className="w-16 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-8 text-left">
          <AnalysisProgress currentStep={currentStep} steps={STEPS} stats={stats} partialNodes={stats.nodesBuilt} />
        </div>
      </div>
    </div>
  );
}
