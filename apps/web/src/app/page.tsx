"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useDepartmentStore } from '../store/useDepartmentStore';
import { useSimpleMode } from '../lib/uiSettings';

interface Department {
  id: string;
  name: string;
  code: string;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const urlDeptId = searchParams.get('deptId');

  // Narrow selectors: destructuring the hook subscribes to every store field, including
  // ones this screen never reads.
  const selectedDeptId = useDepartmentStore((state) => state.selectedDeptId);
  const departments = useDepartmentStore((state) => state.departments);
  const setSelectedDeptId = useDepartmentStore((state) => state.setSelectedDeptId);
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);

  // Simple UI: department picker + two big buttons (Registration, Doctor Desk), no admin actions or decoration.
  const simple = useSimpleMode();

  useEffect(() => {
    loadDepartments(urlDeptId);
  }, [urlDeptId, loadDepartments]);

  // Patient numbers, view only: patients are edited and deleted in the admin panel.
  // Hidden if they can't be loaded (offline, or not logged in yet).
  const [patientStats, setPatientStats] = useState<{ total: number; totalUnique?: number; cameToday: number; totalTokens?: number } | null>(null);
  useEffect(() => {
    const load = () =>
      fetch('/api/v1/patients/stats', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.total === 'number') setPatientStats(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const getHref = (path: string) => {
    return selectedDeptId ? `${path}?deptId=${selectedDeptId}` : path;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden relative selection:bg-blue-500/30">
      
      {/* Dynamic Background Elements */}
      {!simple && (<>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 blur-[100px] rounded-full animate-pulse-slow"></div>
      </div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] opacity-10 pointer-events-none animate-float">
        <div className="absolute inset-0 bg-emerald-500 blur-[120px] rounded-full"></div>
      </div>
      </>)}

      <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 ${simple ? 'py-12' : 'pt-32 pb-12 md:py-20'} flex flex-col items-center justify-center min-h-screen`}>

        {/* Header Section */}
        <div className="text-center mb-10 space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-256.png" alt="AIIMS Kalyani OPD Queue Management" width={128} height={128} className={`mx-auto ${simple ? 'w-24 h-24' : 'w-28 h-28 md:w-32 md:h-32'} drop-shadow-xl`} draggable={false} />
          <div className={`inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm font-semibold tracking-wide backdrop-blur-md ${simple ? '!hidden' : ''}`}>
            <span className="w-2 h-2 rounded-full bg-blue-400 mr-2 animate-pulse"></span>
            System Online & Connected
          </div>
          <h1 className={`${simple ? 'text-4xl md:text-5xl text-white' : 'text-5xl md:text-7xl bg-clip-text text-transparent bg-gradient-to-br from-white via-blue-100 to-slate-400 drop-shadow-sm'} font-black tracking-tight`}>
            AIIMS Kalyani <br/> OPD Queue System
          </h1>
          <p className={`text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed ${simple ? 'hidden' : ''}`}>
            Enterprise-grade queue management hub.
          </p>
        </div>

        {/* Department Selector */}
        <div className={`${simple ? 'mb-10' : 'mb-16'} flex flex-col items-center w-full max-w-md`}>
          <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">
            {simple ? 'Choose your department' : 'Which department do you want to manage?'}
          </label>
          {departments.length === 0 ? (
            <div className="text-slate-500 text-sm py-3">No departments yet. The admin adds them in Admin → Settings.</div>
          ) : (
            <select 
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xl backdrop-blur-md font-medium text-lg appearance-none cursor-pointer text-center"
            >
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name} ({dept.code})</option>
              ))}
            </select>
          )}
        </div>

        {/* Patient numbers (view only) */}
        {patientStats && (
          <div className="mb-10 grid grid-cols-2 gap-3 w-full max-w-md">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Real patients (All-Time)</p>
              <p className="mt-1 text-3xl font-black tabular-nums text-white">
                {(patientStats.totalUnique ?? patientStats.total).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-blue-400 font-medium">Unique (not counted twice)</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Real patients today</p>
              <p className="mt-1 text-3xl font-black tabular-nums text-blue-300">
                {patientStats.cameToday.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-500 font-medium">Unique (not counted twice)</p>
            </div>
          </div>
        )}

        {/* Modules Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${simple ? 'lg:grid-cols-2 max-w-3xl' : 'lg:grid-cols-3 max-w-5xl'} gap-6 w-full transition-all duration-300 ${!selectedDeptId ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          
          {/* Card 1: Registration */}
          <Link href={getHref('/registration')} className="group relative rounded-3xl p-[1px] bg-gradient-to-b from-slate-800 to-slate-900 hover:from-blue-500 hover:to-purple-600 transition-all duration-500 hover:-translate-y-4">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500 to-purple-600 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
              <div>
                <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 19l-7-7 7-7"></path></svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Registration</h3>
                <p className={`text-slate-400 text-sm leading-relaxed ${simple ? 'hidden' : ''}`}>Generate new tokens, assign priorities, and manage patient entry into the OPD.</p>
              </div>
              <div className="mt-8 flex items-center text-blue-400 font-semibold text-sm group-hover:translate-x-2 transition-transform duration-300">
                {simple ? 'Open' : 'Launch Module'} &rarr;
              </div>
            </div>
          </Link>

          {/* Card 2: Doctor Desk (Rooms is in the navbar's gear menu) */}
          <Link href={getHref('/doctor-desk')} className="group relative rounded-3xl p-[1px] bg-gradient-to-b from-slate-800 to-slate-900 hover:from-emerald-400 hover:to-teal-600 transition-all duration-500 hover:-translate-y-4">
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-400 to-teal-600 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
              <div>
                <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Doctor Desk</h3>
                <p className={`text-slate-400 text-sm leading-relaxed ${simple ? 'hidden' : ''}`}>The doctor&apos;s own screen: call the next patient into the room and see who is waiting.</p>
              </div>
              <div className="mt-8 flex items-center text-emerald-400 font-semibold text-sm group-hover:translate-x-2 transition-transform duration-300">
                {simple ? 'Open' : 'Launch Module'} &rarr;
              </div>
            </div>
          </Link>

          {/* Card 3: TV Display */}
          {!simple && (
            <Link href={getHref('/tv')} className="group relative rounded-3xl p-[1px] bg-gradient-to-b from-slate-800 to-slate-900 hover:from-rose-500 hover:to-orange-500 transition-all duration-500 hover:-translate-y-4">
              <div className="absolute inset-0 bg-gradient-to-b from-rose-500 to-orange-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500 rounded-3xl"></div>
              <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col justify-between overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl group-hover:bg-rose-500/20 transition-all"></div>
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform duration-500">
                    <svg className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">TV Monitor</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">High-contrast, large font display for waiting areas. Syncs instantly via WebSockets.</p>
                </div>
                <div className="mt-8 flex items-center text-rose-400 font-semibold text-sm group-hover:translate-x-2 transition-transform duration-300">
                  Launch Module &rarr;
                </div>
              </div>
            </Link>
          )}

        </div>
      </div>

    </div>
  );
}

export default function Home() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>}>
      <HomeContent />
    </React.Suspense>
  );
}
