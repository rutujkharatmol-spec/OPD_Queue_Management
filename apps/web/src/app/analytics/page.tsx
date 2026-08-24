"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart3, Users, CheckCircle2, Clock, AlertTriangle, UserX,
  Building2, Calendar, ArrowLeft, Printer, RefreshCw, Activity, Stethoscope
} from 'lucide-react';
import { getDepartmentAnalytics, getDepartments } from '../../lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { useDepartmentStore } from '../../store/useDepartmentStore';

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const initialDeptId = searchParams.get('deptId');
  // Narrow selectors: destructuring the hook subscribes to every store field.
  const selectedDeptId = useDepartmentStore((state) => state.selectedDeptId);
  const departments = useDepartmentStore((state) => state.departments);
  const setSelectedDeptId = useDepartmentStore((state) => state.setSelectedDeptId);
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);
  const getEffectiveDeptId = useDepartmentStore((state) => state.getEffectiveDeptId);

  const deptId = getEffectiveDeptId(initialDeptId);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDepartments(initialDeptId);
  }, [initialDeptId, loadDepartments]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const data = await getDepartmentAnalytics(deptId || undefined, selectedDate);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [deptId, selectedDate]);

  const currentDept = departments.find((d) => d.id === deptId);

  const totalTokens = analytics?.totalGenerated || 0;
  const completedCount = analytics?.completedCount || 0;
  const waitingCount = analytics?.waitingCount || 0;
  const calledCount = analytics?.calledCount || 0;
  const absentCount = (analytics?.absentCount || 0) + (analytics?.skippedCount || 0);

  const completionRate = totalTokens > 0 ? Math.round((completedCount / totalTokens) * 100) : 0;

  const emergencyCount = analytics?.priorityCounts?.emergency || 0;
  const seniorCount = analytics?.priorityCounts?.senior || 0;
  const normalCount = analytics?.priorityCounts?.normal || 0;

  const hourlyDistribution: Record<string, number> = analytics?.hourlyDistribution || {};
  const maxHourlyCount = Math.max(...Object.values(hourlyDistribution), 1);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 p-4 lg:p-10 print:bg-white print:p-0">

      {/* Header Bar */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 print:mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 print:hidden">
            <BarChart3 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">OPD Analytics &amp; Performance</h1>
              <span className="text-xs font-black bg-blue-100 text-blue-700 px-3 py-0.5 rounded-full uppercase">
                AIIMS Kalyani
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Live consultation metrics, patient throughput, and triage distribution.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {/* Department Picker */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2">
            <Building2 size={16} className="text-slate-500" />
            <select
              value={deptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-800 outline-none cursor-pointer"
            >
              <option value="">All Departments</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name} OPD</option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2">
            <Calendar size={16} className="text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-xs text-slate-800 outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={fetchAnalytics}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Printer size={16} /> Print Report
          </button>

          <Link
            href={selectedDeptId ? `/doctor?deptId=${selectedDeptId}` : '/'}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft size={16} /> Exit
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">

        {/* KPI Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1: Total Registrations */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Patients Today</p>
                <h3 className="text-4xl font-black text-slate-900 mt-2">{totalTokens}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Users size={20} />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Department:</span>
              <strong className="text-slate-800">{currentDept ? currentDept.name : 'All OPDs'}</strong>
            </div>
          </div>

          {/* Card 2: Completed Consultations */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Consultations</p>
                <h3 className="text-4xl font-black text-emerald-600 mt-2">{completedCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle2 size={20} />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Completion Rate:</span>
              <strong className="text-emerald-700 font-black">{completionRate}%</strong>
            </div>
          </div>

          {/* Card 3: In-Queue Active */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Currently In Queue</p>
                <h3 className="text-4xl font-black text-amber-600 mt-2">{waitingCount + calledCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Clock size={20} />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Waiting / In-Room:</span>
              <strong className="text-amber-800">{waitingCount} wait / {calledCount} room</strong>
            </div>
          </div>

          {/* Card 4: Absent / Missed */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Absent / Skipped</p>
                <h3 className="text-4xl font-black text-rose-600 mt-2">{absentCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                <UserX size={20} />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Missed Rate:</span>
              <strong className="text-rose-700">{totalTokens > 0 ? Math.round((absentCount / totalTokens) * 100) : 0}%</strong>
            </div>
          </div>

        </div>

        {/* Middle Section: Triage & Durations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Triage Priority Distribution */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 lg:p-8 shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black text-slate-900">Triage Priority Breakdown</h3>
                <p className="text-xs text-slate-500">Breakdown of patient registrations by medical urgency</p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {totalTokens} Total Tokens
              </span>
            </div>

            <div className="space-y-5">
              {/* Emergency */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-red-700 flex items-center gap-1.5">
                    <span>🚨</span> Emergency Urgent Triage
                  </span>
                  <span className="text-slate-700">
                    {emergencyCount} patients ({totalTokens > 0 ? Math.round((emergencyCount / totalTokens) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-rose-600 rounded-full transition-all duration-500"
                    style={{ width: `${totalTokens > 0 ? (emergencyCount / totalTokens) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Senior Citizen */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-amber-800 flex items-center gap-1.5">
                    <span>🟡</span> Senior Citizen / Fast-track
                  </span>
                  <span className="text-slate-700">
                    {seniorCount} patients ({totalTokens > 0 ? Math.round((seniorCount / totalTokens) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${totalTokens > 0 ? (seniorCount / totalTokens) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Normal */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-blue-700 flex items-center gap-1.5">
                    <span>🟢</span> Standard OPD Consultations
                  </span>
                  <span className="text-slate-700">
                    {normalCount} patients ({totalTokens > 0 ? Math.round((normalCount / totalTokens) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${totalTokens > 0 ? (normalCount / totalTokens) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Velocity & Wait Time Metrics */}
          <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-sm border border-slate-200 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Time &amp; Velocity</h3>
              <p className="text-xs text-slate-500 mb-6">Service velocity benchmarks</p>

              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
                  <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Avg. Consultation Time</p>
                  <p className="text-3xl font-black text-blue-700 mt-1">
                    {analytics?.avgConsultationTimeMins || 6} <span className="text-base font-bold text-blue-500">mins</span>
                  </p>
                  <p className="text-[11px] text-blue-600 mt-1">From doctor call to completed</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Avg. Waiting Queue Time</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">
                    {analytics?.avgWaitTimeMins || 14} <span className="text-base font-bold text-slate-500">mins</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">From token issue to doctor call</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Hourly Inflow Chart */}
        <div className="bg-white rounded-3xl p-6 lg:p-8 shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-black text-slate-900">Hourly Patient Inflow</h3>
              <p className="text-xs text-slate-500">Distribution of patient registrations across operating hours</p>
            </div>
          </div>

          <div className="grid grid-cols-11 gap-2 items-end h-48 pt-6 border-b border-slate-200 pb-2">
            {Object.entries(hourlyDistribution).map(([time, count]) => {
              const barHeightPct = Math.max((count / maxHourlyCount) * 100, 8);
              return (
                <div key={time} className="flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[11px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {count}
                  </span>
                  <div
                    className="w-full max-w-[40px] bg-gradient-to-t from-blue-600 to-indigo-500 rounded-t-xl transition-all duration-500 group-hover:from-blue-700 group-hover:to-indigo-600"
                    style={{ height: `${barHeightPct}%` }}
                  />
                  <span className="text-[10px] font-bold text-slate-400 mt-1 truncate">
                    {time.split(':')[0]}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">Loading Analytics...</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
