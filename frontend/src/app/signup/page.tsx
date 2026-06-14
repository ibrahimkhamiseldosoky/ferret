'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [betaFull, setBetaFull] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.status === 403) {
        setBetaFull(true);
      } else {
        setError(err.message || 'Signup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWaitlist = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || 'Failed to join waitlist');
        return;
      }
      setWaitlistDone(true);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (betaFull) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-amber-700 text-lg font-bold">!</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Beta is full</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Ferret is currently limited to 20 beta test users and we&apos;ve reached capacity.
            Thank you so much for your interest!
          </p>
          {!waitlistDone ? (
            <div className="mt-6">
              <p className="text-sm text-zinc-500 mb-3">
                Join the waitlist and we&apos;ll let you know when we expand:
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleWaitlist}
                  disabled={loading || !email}
                  className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              You&apos;re on the list!
            </div>
          )}
          <p className="mt-6 text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-lg font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-500">Limited to 20 beta testers</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create account'}
          </button>
          <p className="text-center text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
