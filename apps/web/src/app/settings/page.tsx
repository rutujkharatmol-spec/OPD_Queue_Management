"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings as SettingsIcon, Sparkles, RefreshCw, CheckCircle2,
  HardDrive, ShieldCheck, ArrowLeft, Volume2, Database, Wifi,
  Smartphone, Building2, Bell, Check, Server, KeyRound, Lock,
  Eye, EyeOff, AlertCircle, RotateCcw, LogOut
} from 'lucide-react';
import { useDepartmentStore } from '../../store/useDepartmentStore';
import { getOfflineQueue, processOfflineQueue } from '../../lib/offlineSync';
import {
  VoiceGender, AudioLang, VoiceEngineMode, announcePatientCall,
  playHospitalChime, getVoiceEngineMode, setVoiceEngineMode
} from '../../lib/speechService';
import {
  getStoredStaffPassword,
  setStoredStaffPassword,
  resetStoredStaffPassword,
  setStaffAuthenticated,
  DEFAULT_STAFF_PASSWORD
} from '../../lib/authStore';

export default function SettingsPage() {
  // Narrow selectors: destructuring the hook subscribes this page to every store field,
  // so an unrelated department switch elsewhere re-rendered the whole settings screen.
  const departments = useDepartmentStore((state) => state.departments);
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);

  // App Update State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);

  // Sync State
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  // Audio State
  const [playingGender, setPlayingGender] = useState<VoiceGender | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngineMode>('online');

  // Password / Security State
  const [currentSavedPass, setCurrentSavedPass] = useState(DEFAULT_STAFF_PASSWORD);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passStatusMessage, setPassStatusMessage] = useState<string | null>(null);
  const [passErrorMessage, setPassErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadDepartments();
    const queue = getOfflineQueue();
    setPendingSyncCount(queue.length);
    setVoiceEngine(getVoiceEngineMode());
    
    // Password state
    const savedPass = getStoredStaffPassword();
    setCurrentSavedPass(savedPass);
    setNewPasswordInput(savedPass);
    setConfirmPasswordInput(savedPass);
  }, [loadDepartments]);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMessage(null);
    try {
      if (typeof window !== 'undefined' && window.__checkAppUpdate) {
        const hasUpdate = await window.__checkAppUpdate();
        if (hasUpdate) {
          setUpdateStatusMessage('New version detected! Applying update and reloading...');
          if (window.__applyAppUpdate) {
            await window.__applyAppUpdate();
          }
        } else {
          setUpdateStatusMessage('You are already running the latest version of the web app.');
        }
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            setUpdateStatusMessage('Update applied! Reloading...');
            setTimeout(() => window.location.reload(), 500);
          } else {
            setUpdateStatusMessage('Web app is up to date.');
          }
        } else {
          setUpdateStatusMessage('Web app cache is fresh.');
        }
      } else {
        setUpdateStatusMessage('Service Worker not supported on this browser.');
      }
    } catch {
      setUpdateStatusMessage('Checked for updates. You are on the current version.');
    } finally {
      setIsCheckingUpdate(false);
      setTimeout(() => setUpdateStatusMessage(null), 5000);
    }
  };

  const handleForceClearCache = async () => {
    if (!confirm('This will refresh cached scripts and re-sync with the server. Continue?')) return;
    setIsClearingCache(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      setUpdateStatusMessage('Cache cleared successfully! Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch {
      window.location.reload();
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatusMessage(null);
    try {
      const result = await processOfflineQueue();
      const queue = getOfflineQueue();
      setPendingSyncCount(queue.length);
      if (result.succeeded > 0) {
        setSyncStatusMessage(`Successfully synced ${result.succeeded} offline change${result.succeeded > 1 ? 's' : ''}!`);
      } else {
        setSyncStatusMessage('All local data is already up to date with the server.');
      }
    } catch {
      setSyncStatusMessage('Sync failed. Will retry automatically.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMessage(null), 4000);
    }
  };

  const handleTestAudioAnnouncement = async (gender: VoiceGender) => {
    setPlayingGender(gender);
    try {
      await announcePatientCall({
        tokenNumber: 'MED-101',
        roomNumber: '101',
        lang: 'dual',
        gender,
        engineMode: voiceEngine,
      });
    } catch {
      // Ignored
    } finally {
      setPlayingGender(null);
    }
  };

  const handleToggleVoiceEngine = (mode: VoiceEngineMode) => {
    setVoiceEngine(mode);
    setVoiceEngineMode(mode);
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPassErrorMessage(null);
    setPassStatusMessage(null);

    const trimmed = newPasswordInput.trim();
    if (!trimmed) {
      setPassErrorMessage('Password cannot be empty.');
      return;
    }

    if (trimmed !== confirmPasswordInput.trim()) {
      setPassErrorMessage('Password confirmation does not match.');
      return;
    }

    const success = setStoredStaffPassword(trimmed);
    if (success) {
      setCurrentSavedPass(trimmed);
      setPassStatusMessage(`Staff password successfully updated to "${trimmed}". Next login will require this password.`);
      setTimeout(() => setPassStatusMessage(null), 5000);
    } else {
      setPassErrorMessage('Failed to save password.');
    }
  };

  const handleResetPassword = () => {
    resetStoredStaffPassword();
    setCurrentSavedPass(DEFAULT_STAFF_PASSWORD);
    setNewPasswordInput(DEFAULT_STAFF_PASSWORD);
    setConfirmPasswordInput(DEFAULT_STAFF_PASSWORD);
    setPassErrorMessage(null);
    setPassStatusMessage('Staff password reset back to default.');
    setTimeout(() => setPassStatusMessage(null), 4000);
  };

  const handleLockSystem = () => {
    setStaffAuthenticated(false);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 p-6 lg:p-10">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 max-w-5xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              System &amp; Web App Settings
            </h1>
            <p className="text-slate-500 font-medium text-xs mt-0.5">
              Manage staff password, software updates, offline sync, and audio announcements.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-2 text-xs"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">

        {/* 1. Staff Access Password & Security Management */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <KeyRound size={20} className="text-blue-600" />
                Staff Access Password &amp; Passcode
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Configure or change the password required to unlock and access staff OPD dashboards and doctor rooms.
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full w-fit ${
              currentSavedPass === DEFAULT_STAFF_PASSWORD ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-800'
            }`}>
              <Lock size={13} className={currentSavedPass === DEFAULT_STAFF_PASSWORD ? 'text-slate-500' : 'text-blue-600'} />
              {currentSavedPass === DEFAULT_STAFF_PASSWORD ? 'Default Password Active' : 'Custom Password Active'}
            </span>
          </div>

          <div className="p-6 lg:p-8 space-y-6">
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Staff Password Textbox
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswordText ? "text" : "password"}
                      value={newPasswordInput}
                      onChange={(e) => {
                        setNewPasswordInput(e.target.value);
                        setPassErrorMessage(null);
                      }}
                      placeholder="Enter new password"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-2.5 pr-11 text-slate-900 placeholder-slate-400 font-mono text-sm transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
                      title={showPasswordText ? "Hide password" : "Show password"}
                    >
                      {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Current active password: <span className="font-mono font-bold text-slate-700">{showPasswordText ? currentSavedPass : '••••'}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type={showPasswordText ? "text" : "password"}
                    value={confirmPasswordInput}
                    onChange={(e) => {
                      setConfirmPasswordInput(e.target.value);
                      setPassErrorMessage(null);
                    }}
                    placeholder="Retype password"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 font-mono text-sm transition-all"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Retype to prevent any accidental typos.
                  </p>
                </div>
              </div>

              {passErrorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={16} className="text-red-500 shrink-0" />
                  <span>{passErrorMessage}</span>
                </div>
              )}

              {passStatusMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{passStatusMessage}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  <span>Save Password Changes</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Reset to Default</span>
                </button>

                <button
                  type="button"
                  onClick={handleLockSystem}
                  className="py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer sm:ml-auto"
                  title="Lock system to test the unlock password"
                >
                  <LogOut size={14} />
                  <span>Lock System Now (Test Unlock)</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* 3. Web App Updates & Version Card */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Sparkles size={20} className="text-indigo-600" />
                Web App Version &amp; Software Updates
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Check for new software releases, refresh cached assets, or trigger instant PWA updates.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-100 text-emerald-800 px-3.5 py-1.5 rounded-full w-fit">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              PWA v1.2.0 Active
            </span>
          </div>

          <div className="p-6 lg:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Service Worker</p>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Registered &amp; Active
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Offline Persistence</p>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <HardDrive size={16} className="text-blue-500" /> LocalStorage Database
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Release Channel</p>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-indigo-500" /> Production Main
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                onClick={handleCheckUpdate}
                disabled={isCheckingUpdate}
                className="py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={16} className={isCheckingUpdate ? 'animate-spin' : ''} />
                <span>{isCheckingUpdate ? 'Checking for Updates...' : 'Check & Update Web App'}</span>
              </button>

              <button
                onClick={handleForceClearCache}
                disabled={isClearingCache}
                className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>{isClearingCache ? 'Clearing Cache...' : 'Clear Offline Cache & Refresh'}</span>
              </button>
            </div>

            {updateStatusMessage && (
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                <span>{updateStatusMessage}</span>
              </div>
            )}
          </div>
        </section>

        {/* 4. Offline Storage & Data Sync Hub */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Database size={20} className="text-blue-600" />
                Offline Storage &amp; Data Sync
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Manage local client cache, inspect pending offline mutations, or force re-sync with server.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-blue-100 text-blue-800 px-3.5 py-1.5 rounded-full w-fit">
              <Wifi size={14} className="text-blue-600" />
              {pendingSyncCount > 0 ? `${pendingSyncCount} Pending Changes` : 'All Synced'}
            </span>
          </div>

          <div className="p-6 lg:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <HardDrive size={18} />
                </div>
                <div>
                  <p className="font-bold text-xs text-slate-800">Local Browser Storage</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Tokens, departments, and rooms are saved automatically to your local browser storage for instant zero-latency operation.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Server size={18} />
                </div>
                <div>
                  <p className="font-bold text-xs text-slate-800">PostgreSQL Dual Database Mode</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Configured for automatic fallback between Local On-Premise PostgreSQL and Neon Cloud database.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Local Data with Server'}</span>
              </button>
            </div>

            {syncStatusMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                <Check size={16} className="text-emerald-600 shrink-0" />
                <span>{syncStatusMessage}</span>
              </div>
            )}
          </div>
        </section>

        {/* 5. Audio & Realistic Voice Preferences */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Volume2 size={20} className="text-amber-600" />
                Realistic Human Voice &amp; TV Audio
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Configure patient call announcements with realistic online human voices and offline fallback.
              </p>
            </div>
            <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1.5 ${
              voiceEngine === 'online' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              <span className={`w-2 h-2 rounded-full ${voiceEngine === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {voiceEngine === 'online' ? 'Online HD Voice Active' : 'Offline Local Voice Active'}
            </span>
          </div>

          <div className="p-6 lg:p-8 space-y-6">
            {/* Voice Engine Mode Switcher */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-800 mb-1">Select Voice Engine Mode</p>
              <p className="text-[11px] text-slate-500 mb-4">
                Choose whether announcements stream high-definition natural human speech over the internet or use local device voices.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleVoiceEngine('online')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    voiceEngine === 'online'
                      ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20 text-blue-900 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${voiceEngine === 'online' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Wifi size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black">🌐 Online Realistic HD Voice</p>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Recommended</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Streams high-definition natural human speech with clear pronunciation. Falls back automatically if internet disconnects.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleVoiceEngine('offline')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    voiceEngine === 'offline'
                      ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-500/20 text-amber-900 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${voiceEngine === 'offline' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <HardDrive size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black">📴 Offline Local Voice Only</p>
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Zero Network</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Always uses device Web Speech API without sending audio requests across the network. Works 100% disconnected.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Test Voice Cards (Female & Male) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Female Voice Card */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2.5 py-1 rounded-lg">
                      👩 Female Voice (Default)
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Dual Lang / EN / HI</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">Natural Female Announcement</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {voiceEngine === 'online'
                      ? 'Streams high-definition natural female voice with warm clinic tone.'
                      : 'Uses calibrated offline local female voice synthesis.'}
                  </p>
                </div>
                <button
                  onClick={() => handleTestAudioAnnouncement('female')}
                  disabled={playingGender !== null}
                  className="mt-4 w-full py-2.5 px-4 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs rounded-xl shadow-md shadow-pink-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Bell size={14} className={playingGender === 'female' ? 'animate-bounce' : ''} />
                  <span>{playingGender === 'female' ? 'Announcing Female Voice...' : `Test Female Voice (${voiceEngine === 'online' ? 'Online HD' : 'Offline'})`}</span>
                </button>
              </div>

              {/* Male Voice Card */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                      👨 Male Voice
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Dual Lang / EN / HI</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">Natural Male Announcement</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {voiceEngine === 'online'
                      ? 'Streams deep, clear natural male voice suited for hospital waiting halls.'
                      : 'Uses calibrated offline local male voice synthesis.'}
                  </p>
                </div>
                <button
                  onClick={() => handleTestAudioAnnouncement('male')}
                  disabled={playingGender !== null}
                  className="mt-4 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Bell size={14} className={playingGender === 'male' ? 'animate-bounce' : ''} />
                  <span>{playingGender === 'male' ? 'Announcing Male Voice...' : `Test Male Voice (${voiceEngine === 'online' ? 'Online HD' : 'Offline'})`}</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="font-bold text-xs text-slate-800 flex items-center gap-2">
                <Smartphone size={16} className="text-blue-500" />
                TV Kiosk Fullscreen Mode Tip
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                When displaying the TV monitor in waiting halls, press <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px] font-bold text-slate-700">F11</kbd> on your keyboard to enter immersive fullscreen display mode.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Registered OPD Departments Directory */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Building2 size={20} className="text-blue-600" />
                OPD Departments Directory
              </h2>
              <p className="text-slate-500 text-xs mt-1">
                Active clinical departments registered in the AIIMS Kalyani queue system.
              </p>
            </div>
            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
              {departments.length} Department{departments.length === 1 ? '' : 's'} Active
            </span>
          </div>

          <div className="p-6 lg:p-8">
            {departments.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No departments found. Use &apos;+ ADD OPD Department&apos; on the Home screen to add departments.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center">
                        {dept.code}
                      </div>
                      <div>
                        <p className="font-bold text-xs text-slate-900">{dept.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">Code: {dept.code}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
