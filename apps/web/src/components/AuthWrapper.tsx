"use client";
import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  // We only check auth on client side after hydration to avoid mismatch
  useEffect(() => {
    const auth = localStorage.getItem('opd_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  // Exclude /patient from password protection
  if (pathname?.startsWith('/patient')) {
    return <>{children}</>;
  }

  // Still hydrating or determining auth state
  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-slate-950"></div>;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '89') {
      localStorage.setItem('opd_auth', 'true');
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
        
        {/* Decorative elements */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500 rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500 rounded-full blur-[80px] opacity-20 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-slate-700 text-blue-400">
            <Lock size={32} />
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-2">Restricted Access</h1>
          <p className="text-slate-400 text-sm mb-8">Please enter the staff password to access the OPD Queue Management System.</p>

          <form onSubmit={handleSubmit} className="w-full">
            <div className="mb-6">
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className={`w-full bg-slate-950 border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:ring-blue-500'} rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 text-center tracking-widest font-mono text-lg transition-all`}
                autoFocus
              />
              {error && <p className="text-red-400 text-xs mt-2">Incorrect password. Try again.</p>}
            </div>
            
            <button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-600/20"
            >
              Unlock System
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
