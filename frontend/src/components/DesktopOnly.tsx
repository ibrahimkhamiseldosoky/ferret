'use client';

import { useEffect, useState } from 'react';

export default function DesktopOnly({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (isMobile === null) return null;

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-white text-2xl font-bold">F</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Desktop Only</h1>
        <p className="text-zinc-500 max-w-xs leading-relaxed">
          Ferret is designed for desktop use. Please open this site on a computer.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
