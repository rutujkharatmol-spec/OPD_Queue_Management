"use client";
import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Lock, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft, RotateCcw } from 'lucide-react';
import {
  getStoredStaffPassword,
  setStoredStaffPassword,
  resetStoredStaffPassword,
  isStaffAuthenticated,
  setStaffAuthenticated,
  DEFAULT_STAFF_PASSWORD
} from '../lib/authStore';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  
  // Login form state
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Change password mode state
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  // We only check auth on client side after hydration to avoid mismatch
  useEffect(() => {
    setIsAuthenticated(isStaffAuthenticated());
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
    const correctPassword = getStoredStaffPassword();
    
    if (password.trim() === correctPassword) {
      setStaffAuthenticated(true);
      setIsAuthenticated(true);
      setError(null);
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  const handleSaveNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = getStoredStaffPassword();

    // Verify current password
    if (currentPassInput.trim() !== correctPassword) {
      setChangeError('Current password is incorrect.');
      return;
    }

    if (!newPassInput.trim()) {
      setChangeError('New password cannot be empty.');
      return;
    }

    if (newPassInput.trim() !== confirmPassInput.trim()) {
      setChangeError('New passwords do not match.');
      return;
    }

    // Save new password and automatically unlock
    setStoredStaffPassword(newPassInput.trim());
    setStaffAuthenticated(true);
    setIsAuthenticated(true);
    setChangeError(null);
  };

  const handleQuickReset = () => {
    resetStoredStaffPassword();
    setChangeError(null);
    setSuccessMessage('Password reset to default. You can now login.');
    setIsChangingPass(false);
    setPassword(DEFAULT_STAFF_PASSWORD);
    setCurrentPassInput(DEFAULT_STAFF_PASSWORD);
    setNewPassInput(DEFAULT_STAFF_PASSWORD);
    setConfirmPassInput(DEFAULT_STAFF_PASSWORD);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
        
        {/* Decorative background glow */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500 rounded-full blur-[90px] opacity-20 pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500 rounded-full blur-[90px] opacity-20 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          
          {/* Top Icon */}
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-5 shadow-inner border border-slate-700 text-blue-400">
            {isChangingPass ? <KeyRound size={30} className="text-amber-400" /> : <Lock size={30} />}
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-1.5">
            {isChangingPass ? 'Change Staff Password' : 'Staff Access Required'}
          </h1>
          <p className="text-slate-400 text-xs mb-6 max-w-xs">
            {isChangingPass 
              ? 'Enter your current password and type a new password in the textbox below.'
              : 'Enter the password to access the AIIMS Kalyani OPD Queue Management System.'}
          </p>

          {successMessage && !isChangingPass && (
            <div className="w-full mb-5 p-3 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 text-left animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {!isChangingPass ? (
            /* Login Form */
            <form onSubmit={handleSubmit} className="w-full text-left">
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Staff Password Textbox
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter password"
                    className={`w-full bg-slate-950 border ${error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'} rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none font-mono text-base transition-all`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {error && (
                  <p className="text-red-400 text-xs mt-2 flex items-center gap-1.5 font-medium">
                    <AlertCircle size={14} className="shrink-0" /> {error}
                  </p>
                )}
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Lock size={16} />
                <span>Unlock System</span>
              </button>

              <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPass(true);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <KeyRound size={14} /> Change Password
                </button>

                <button
                  type="button"
                  onClick={handleQuickReset}
                  className="text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title="Reset to default password"
                >
                  <RotateCcw size={12} /> Reset to Default
                </button>
              </div>
            </form>
          ) : (
            /* Change Password Form with Textboxes */
            <form onSubmit={handleSaveNewPassword} className="w-full text-left space-y-3.5">
              {changeError && (
                <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-xl text-red-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <span>{changeError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Current Password
                </label>
                <input 
                  type="password"
                  value={currentPassInput}
                  onChange={(e) => {
                    setCurrentPassInput(e.target.value);
                    setChangeError(null);
                  }}
                  placeholder="Enter current password"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none font-mono text-sm transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  New Password Textbox
                </label>
                <div className="relative">
                  <input 
                    type={showNewPass ? "text" : "password"}
                    value={newPassInput}
                    onChange={(e) => {
                      setNewPassInput(e.target.value);
                      setChangeError(null);
                    }}
                    placeholder="Enter new password"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl px-4 py-2.5 pr-11 text-white placeholder-slate-500 focus:outline-none font-mono text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <input 
                  type={showNewPass ? "text" : "password"}
                  value={confirmPassInput}
                  onChange={(e) => {
                    setConfirmPassInput(e.target.value);
                    setChangeError(null);
                  }}
                  placeholder="Confirm new password"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none font-mono text-sm transition-all"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-amber-600/25 flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <CheckCircle2 size={16} />
                  <span>Save New Password &amp; Unlock</span>
                </button>

                <button 
                  type="button" 
                  onClick={() => {
                    setIsChangingPass(false);
                    setChangeError(null);
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Back to Login</span>
                </button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleQuickReset}
                  className="text-slate-500 hover:text-slate-300 text-[11px] font-medium transition-colors"
                >
                  Forgot password? Reset to default
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
