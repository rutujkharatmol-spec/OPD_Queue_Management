import React from 'react';
import Link from 'next/link';
import {
  ClipboardList, Stethoscope, Tv, Sparkles, CheckCircle2, ArrowRight,
  Zap, Search, PhoneCall, Volume2, ShieldAlert, RotateCcw, Plus,
  Layers, Clock, Bell, UserCheck, HelpCircle, BookOpen
} from 'lucide-react';

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-500 selection:text-white">
      {/* Hero Header */}
      <header className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 py-16 px-4 sm:px-6 lg:px-8 text-center">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
            <BookOpen size={14} />
            <span>AIIMS Kalyani OPD Queue Guide</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            How to Use the <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">OPD Queue System</span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
            A simple, step-by-step guide on how the OPD Queue works across Registration, Doctor Rooms, and Waiting TV screens.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/registration"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/25 transition-all active:scale-95"
            >
              Open Registration Desk ➔
            </Link>
            <Link
              href="/doctor"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
            >
              Open Doctor Room ➔
            </Link>
            <Link
              href="/tv"
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all active:scale-95"
            >
              Open TV Display ➔
            </Link>
          </div>
        </div>
      </header>

      {/* 3 Main Sections */}
      <main className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Section 1: Registration Desk */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
              <ClipboardList size={24} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-blue-400">Step 1</span>
              <h2 className="text-2xl font-black text-white">Registration Desk (Issuing Tokens)</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <CheckCircle2 size={16} />
                <h3>Single Patient Token</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter the patient's name, mobile number or UHID, pick their priority, and click <strong>Generate Token</strong>. The token is immediately queued.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Zap size={16} />
                <h3>Custom &amp; Staged Tokens</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Optionally provide a custom token number, or stage patients directly into a specific consultation room's upcoming queue.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <ShieldAlert size={16} />
                <h3>Priority Levels</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mark emergency patients with <strong>🚨 Emergency Priority</strong> to jump to the front of the queue automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Doctor Dashboard */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black">
              <Stethoscope size={24} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-indigo-400">Step 2</span>
              <h2 className="text-2xl font-black text-white">Doctor Consultation Rooms</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <PhoneCall size={16} />
                <h3>Call Next Patient</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Click <strong>"Call Next Patient"</strong> to call the next patient in line. The token is announced on the TV screen instantly.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Zap size={16} />
                <h3>⚡ Auto-Call Mode</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Toggle <strong>"Auto-Call ON"</strong> on your room card. When you click Complete, the next patient is called automatically with zero clicks.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Search size={16} />
                <h3>Search &amp; Drag-and-Drop</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Search any token number in the sidebar search bar and drag the patient card directly into any room to call or queue them.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <RotateCcw size={16} />
                <h3>Pass &amp; Recall</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Use <strong>Pass (+3)</strong> if a patient is temporarily away, <strong>Recall (🔔)</strong> to ring the chime again, or <strong>Complete</strong> when finished.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: TV Display */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
              <Tv size={24} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Step 3</span>
              <h2 className="text-2xl font-black text-white">Waiting Hall TV Monitor</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Volume2 size={16} />
                <h3>Voice Announcements</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Speaks out loud in English, Hindi, and Bengali (e.g. <em>"Token 5, please proceed to Room 301"</em>) whenever a patient is called.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                <Sparkles size={16} />
                <h3>Light &amp; Dark Mode</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Defaults to high-contrast Light Mode for bright waiting rooms. Toggle to Dark Mode anytime via the theme button.
              </p>
            </div>

            <div className="p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Layers size={16} />
                <h3>Full-Screen Mode</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Press <strong>'F'</strong> on the keyboard to enter Full Screen TV Mode with zero browser distraction for the waiting hall.
              </p>
            </div>
          </div>
        </section>

        {/* Quick Flow Summary */}
        <div className="p-8 bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900/60 border border-blue-500/30 rounded-3xl text-center space-y-4">
          <h3 className="text-xl font-bold text-white">Daily OPD Workflow Summary</h3>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300">
            <span className="bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-700 font-bold text-blue-400">1. Receptionist issues Token</span>
            <ArrowRight size={16} className="text-slate-500 hidden sm:inline" />
            <span className="bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-700 font-bold text-emerald-400">2. TV screen announces &amp; displays</span>
            <ArrowRight size={16} className="text-slate-500 hidden sm:inline" />
            <span className="bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-700 font-bold text-indigo-400">3. Doctor examines &amp; completes</span>
          </div>
        </div>

      </main>
    </div>
  );
}
