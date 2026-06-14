'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Upload, FolderCode, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { listRepositories, uploadRepository } from '@/lib/api';
import type { Repository } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRepositories()
      .then(setRepos)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load repositories'))
      .finally(() => setLoading(false));
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const repo = await uploadRepository(file);
      router.push(`/repos/${repo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      <header className="flex items-center justify-between px-8 py-4 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">F</span>
            </div>
            <span className="font-semibold text-zinc-900">Ferret</span>
          </Link>
          <span className="text-zinc-300">/</span>
          <span className="text-zinc-600 font-medium text-sm">Repositories</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading...' : 'Upload Repository'}
        </button>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <h2 className="text-xl font-semibold text-zinc-900 mb-6">Recent Repositories</h2>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-xl border border-zinc-200 bg-zinc-50 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FolderCode className="w-12 h-12 text-zinc-300 mb-4" />
            <p className="text-zinc-600 text-sm max-w-xs">
              No repositories yet. Upload your first repository to get started.
            </p>
          </div>
        )}

        {!loading && !error && repos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {repos.map((repo) => (
              <Link
                key={repo.id}
                href={`/repos/${repo.id}`}
                className="block p-5 rounded-xl border border-zinc-200 hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <h3 className="font-semibold text-zinc-900 truncate">{repo.name}</h3>
                <div className="mt-3 flex items-center gap-3">
                  {repo.language && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700">
                      {repo.language}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{repo.file_count} files</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(repo.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
