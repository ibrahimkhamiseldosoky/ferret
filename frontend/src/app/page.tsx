'use client';

import Link from "next/link";
import { useState } from "react";
import { Upload, GitBranch, Share2, Bot, Workflow } from "lucide-react";

const features = [
  { icon: GitBranch, title: "Architecture Maps", desc: "Visualize your entire codebase structure and relationships." },
  { icon: Share2, title: "Dependency Analysis", desc: "Track dependencies across files, services, and APIs." },
  { icon: Bot, title: "AI Explanations", desc: "Ask questions about any part of your codebase in plain English." },
  { icon: Workflow, title: "Impact Analysis", desc: "Understand how changes ripple through your system." },
];

export default function Home() {
  const [showGithubToast, setShowGithubToast] = useState(false);

  return (
    <div className="flex flex-col flex-1">
      {showGithubToast && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={() => setShowGithubToast(false)}>
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-4 text-center" onClick={(e) => e.stopPropagation()}>
            <svg className="w-8 h-8 text-zinc-900 mx-auto mb-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            <p className="text-sm text-zinc-700">GitHub integration coming soon.</p>
            <p className="text-xs text-zinc-400 mt-1">Upload a ZIP file to get started now.</p>
            <button
              onClick={() => setShowGithubToast(false)}
              className="mt-4 h-9 px-4 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <header className="flex items-center justify-between px-8 py-4 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">F</span>
          </div>
          <span className="font-semibold text-zinc-900">Ferret</span>
        </div>
        <Link
          href="/login"
          className="ml-auto h-8 px-4 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors inline-flex items-center"
        >
          Sign in
        </Link>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-zinc-900 leading-[1.1]">
            Understand Any Codebase In Minutes
          </h1>
          <p className="mt-6 text-lg text-zinc-600 leading-relaxed max-w-lg mx-auto">
            Upload a repository and instantly explore its architecture, dependencies, and behavior.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <button
              onClick={() => setShowGithubToast(true)}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-zinc-900 text-white font-medium text-sm hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              Connect GitHub
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-lg border border-zinc-300 text-zinc-900 font-medium text-sm hover:bg-zinc-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload ZIP
            </Link>
          </div>
        </div>
        <div className="mt-24 max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-2 gap-8">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900">{f.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
