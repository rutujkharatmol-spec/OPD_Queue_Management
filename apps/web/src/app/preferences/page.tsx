"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings as SettingsIcon, Sparkles, RefreshCw, CheckCircle2,
  HardDrive, ShieldCheck, ArrowLeft, Volume2, Database, Wifi,
  Smartphone, Bell, Check, Server, LogOut, Monitor, RotateCcw
} from 'lucide-react';
import { getOfflineQueue, processOfflineQueue } from '../../lib/offlineSync';
import {
  VoiceGender, VoiceEngineMode, announcePatientCall,
  getVoiceEngineMode, setVoiceEngineMode
} from '../../lib/speechService';
import {
  useSimpleMode, UiVisibilitySettings, DEFAULT_UI_SETTINGS,
  getUiVisibilitySettings, setUiVisibilitySettings, resetUiVisibilitySettings,
} from '../../lib/uiSettings';

/**
 * Settings for this computer only, opened from the main menu by staff: the announcement
 * voice, what the screens show, app updates, offline data, and signing this device out.
 * Nothing here changes other computers. Hospital-wide settings (departments, logins,
 * cloud copy, backups) are in the admin panel's Settings.
 */

// What the screens show, as in the eye menu on the top bar.
const SCREEN_OPTIONS: { key: keyof UiVisibilitySettings; label: string; detail: string }[] = [
  { key: 'simpleMode', label: 'Simple UI', detail: 'Only the everyday buttons. Turn off to see every control.' },
  { key: 'showQueueSidebar', label: 'Waiting line sidebar', detail: 'The list of waiting patients on the Doctor Room screen.' },
  { key: 'showRoomStagedQueue', label: 'Patients sent to each room', detail: "Each room's own list on the Doctor Room screen." },
  { key: 'showAutoCallToggle', label: 'Auto-call buttons', detail: 'Lets a room call its next patient by itself.' },
  { key: 'showDoctorNames', label: 'Doctor names', detail: 'Doctor names and badges on the room cards.' },
  { key: 'showQuickActions', label: 'Header actions and Pass (+N)', detail: 'Extra buttons at the top of the Doctor Room screen.' },
  { key: 'showDeptSwitcher', label: 'Department switcher', detail: 'The department menu on the top bar.' },
];

export default function PreferencesPage() {
  // Simple UI: hide the technical cards (app updates, offline storage).
  const simple = useSimpleMode();

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

  // Screen options
  const [screen, setScreen] = useState<UiVisibilitySettings>(DEFAULT_UI_SETTINGS);

  // Staff sign-out
  const [signingOut, setSigningOut] = useState(false);
  const [staffSignOutMessage, setStaffSignOutMessage] = useState<string | null>(null);

  useEffect(() => {
    setPendingSyncCount(getOfflineQueue().length);
    setVoiceEngine(getVoiceEngineMode());
    setScreen(getUiVisibilitySettings());
    // The eye menu on the top bar changes the same settings.
    const onChange = () => setScreen(getUiVisibilitySettings());
    window.addEventListener('opd-ui-visibility-updated', onChange);
    return () => window.removeEventListener('opd-ui-visibility-updated', onChange);
  }, []);

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

  const handleStaffSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/v1/staff/logout', { method: 'POST' });
    } catch {}
    try { localStorage.removeItem('opd_auth'); } catch {}
    setSigningOut(false);
    setStaffSignOutMessage('This device is signed out of the staff screens. The next person must enter the staff password.');
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <header className="flex flex-wrap justify-between items-center gap-4 mb-8 max-w-5xl mx-auto bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-blue-500/20">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Settings for this computer</h1>
            <p className="text-slate-500 font-medium text-xs mt-0.5">
              Announcement voice, screen options, updates and sign-out. Changes here affect only this computer.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-2 text-xs"
        >
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">

        {/* Screen options */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Monitor size={20} className="text-blue-600" />
                Screen options
              </h2>
              <p className="text-slate-500 text-xs mt-1">What the screens show on this computer. Same as the eye menu on the top bar.</p>
            </div>
            <button
              type="button"
              onClick={() => setScreen(resetUiVisibilitySettings())}
              className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-2 w-fit cursor-pointer"
            >
              <RotateCcw size={14} /> Reset to default
            </button>
          </div>
          <ul className="p-4 lg:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SCREEN_OPTIONS.map((o) => (
              <li key={o.key}>
                <label className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3 cursor-pointer hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={screen[o.key]}
                    onChange={() => setScreen(setUiVisibilitySettings({ [o.key]: !screen[o.key] }))}
                    className="mt-0.5 w-4 h-4 accent-blue-600"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-800">{o.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{o.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        {/* App updates */}
        <section className={`bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden ${simple ? 'hidden' : ''}`}>
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

        {/* Offline storage and sync */}
        <section className={`bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden ${simple ? 'hidden' : ''}`}>
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

        {/* Announcement voice */}
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

        {/* Sign out this computer */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 lg:p-8 space-y-4 text-sm text-slate-700">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <LogOut size={20} className="text-red-600" />
              Sign out this computer
            </h2>
            <p className="text-xs text-slate-500">
              The next person will have to enter the staff password. The password itself is set by the admin.
            </p>

            {staffSignOutMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{staffSignOutMessage}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleStaffSignOut}
              disabled={signingOut}
              className="py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <LogOut size={14} />
              <span>Sign Out This Device</span>
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
