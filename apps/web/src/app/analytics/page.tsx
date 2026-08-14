"use client";
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getDepartments, getDepartmentAnalytics } from '../../lib/api';
import { 
  BarChart3, 
  Users, 
  CheckCircle2, 
  Clock, 
  UserX, 
  AlertTriangle, 
  ArrowLeft, 
  Building2, 
  TrendingUp, 
  Calendar, 
  RefreshCw,
  Printer
} from 'lucide-react';

interface AnalyticsData {
  departmentName: string;
  date: string;
  totalTokens: number;
  waiting: number;
  called: number;
  completed: number;
  absent: number;
  skipped: number;
  emergencyCount: number;
  seniorCount: number;
  normalCount: number;
  avgConsultationMins: number;
  hourlyBreakdown: { hour: string; count: number }[];
}

interface Department {
  id: string;
  name: string;
  code: string;
}

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const initialDeptId = searchParams.get('deptId') || '';

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(initialDeptId);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDepts() {
      try {
        const depts = await getDepartments();
        setDepartments(depts);
        if (depts.length > 0 && !selectedDeptId) {
          setSelectedDeptId(depts[0].id);
        }
      } catch (e) {
        console.error('Failed to load departments', e);
      }
    }
    loadDepts();
  }, []);

  const fetchAnalytics = async (deptId: string) => {
    if (!deptId) return;
    setLoading(true);
    try {
      const data = await getDepartmentAnalytics(deptId);
      setAnalytics(data);
    } catch (e) {
      console.error('Failed to fetch analytics', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDeptId) {
      fetchAnalytics(selectedDeptId);
    }
  }, [selectedDeptId]);

  const completionRate = analytics?.totalTokens && analytics.totalTokens > 0
    ? Math.round((analytics.completed / analytics.totalTokens) * 100)
    : 0;

  const maxHourlyCount = analytics?.hourlyBreakdown?.length
    ? Math.max(...analytics.hourlyBreakdown.map(h => h.count), 1)
    : 1;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-blue-500/30 p-4 sm:p-8 lg:p-12 print:bg-white print:text-black print:p-0">
      
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link 
              href={selectedDeptId ? `/doctor?deptId=${selectedDeptId}` : '/'}
              className="text-slate-400 hover:text-white text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <ArrowLeft size={14} /> Back to Doctor Dashboard
            </Link>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
            <BarChart3 className="text-blue-400" size={36} /> OPD Performance Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">Real-time daily patient throughput and queue operational metrics</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {departments.length > 0 && (
            <select
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name} OPD</option>
              ))}
            </select>
          )}

          <button
            onClick={() => fetchAnalytics(selectedDeptId)}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-colors"
            title="Refresh Analytics"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <Printer size={16} /> Print Report
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Top KPI Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          
          {/* Total Registrations */}
          <div className="bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Registered</p>
                <h3 className="text-4xl font-black text-white mt-2 tracking-tight">
                  {loading ? '--' : analytics?.totalTokens ?? 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Users size={24} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-4 flex items-center gap-1 font-medium">
              <Calendar size={13} /> Today ({analytics?.date || new Date().toISOString().split('T')[0]})
            </p>
          </div>

          {/* Completed Consultations */}
          <div className="bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Completed</p>
                <h3 className="text-4xl font-black text-emerald-400 mt-2 tracking-tight">
                  {loading ? '--' : analytics?.completed ?? 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={24} />
              </div>
            </div>
            <p className="text-xs text-emerald-400/80 mt-4 flex items-center gap-1 font-medium">
              <TrendingUp size={13} /> {completionRate}% completion rate
            </p>
          </div>

          {/* In Queue / Waiting */}
          <div className="bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">In Waiting Queue</p>
                <h3 className="text-4xl font-black text-amber-400 mt-2 tracking-tight">
                  {loading ? '--' : analytics?.waiting ?? 0}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Clock size={24} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-4 flex items-center gap-1 font-medium">
              Actively in line
            </p>
          </div>

          {/* Absent / Skipped */}
          <div className="bg-slate-900/80 border border-slate-800/80 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Absent / Skipped</p>
                <h3 className="text-4xl font-black text-rose-400 mt-2 tracking-tight">
                  {loading ? '--' : (analytics?.absent ?? 0) + (analytics?.skipped ?? 0)}
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <UserX size={24} />
              </div>
            </div>
            <p className="text-xs text-rose-400/80 mt-4 flex items-center gap-1 font-medium">
              {analytics?.absent ?? 0} absent, {analytics?.skipped ?? 0} skipped
            </p>
          </div>

        </div>

        {/* Priority & Consultation Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Priority Distribution */}
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-md flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Queue Priority Breakdown</h3>
              <p className="text-xs text-slate-400 mb-6">Patient triage distribution for {analytics?.departmentName || 'OPD'}</p>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-red-400 flex items-center gap-1.5">🚨 Emergency</span>
                    <span>{analytics?.emergencyCount ?? 0} ({analytics?.totalTokens ? Math.round(((analytics.emergencyCount || 0) / analytics.totalTokens) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 transition-all duration-500" 
                      style={{ width: `${analytics?.totalTokens ? ((analytics.emergencyCount || 0) / analytics.totalTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-amber-300 flex items-center gap-1.5">🟡 Senior Citizen</span>
                    <span>{analytics?.seniorCount ?? 0} ({analytics?.totalTokens ? Math.round(((analytics.seniorCount || 0) / analytics.totalTokens) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-400 transition-all duration-500" 
                      style={{ width: `${analytics?.totalTokens ? ((analytics.seniorCount || 0) / analytics.totalTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-blue-400 flex items-center gap-1.5">🟢 Normal Queue</span>
                    <span>{analytics?.normalCount ?? 0} ({analytics?.totalTokens ? Math.round(((analytics.normalCount || 0) / analytics.totalTokens) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-500" 
                      style={{ width: `${analytics?.totalTokens ? ((analytics.normalCount || 0) / analytics.totalTokens) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
              <span>Avg Consultation Time</span>
              <span className="font-bold text-white text-sm">~{analytics?.avgConsultationMins ?? 0} mins / patient</span>
            </div>
          </div>

          {/* Hourly Traffic Chart */}
          <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Hourly Patient Inflow</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Tokens registered per hour today</p>
                </div>
                <div className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
                  {analytics?.departmentName || 'Department'}
                </div>
              </div>

              {/* Bar Chart */}
              <div className="h-48 flex items-end gap-2 sm:gap-3 pt-6 pb-2 border-b border-slate-800">
                {analytics?.hourlyBreakdown?.map((h, i) => {
                  const heightPercent = Math.round((h.count / maxHourlyCount) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                      <span className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {h.count}
                      </span>
                      <div 
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          h.count > 0 ? 'bg-gradient-to-t from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400' : 'bg-slate-800/50'
                        }`}
                        style={{ height: `${Math.max(heightPercent, 4)}%` }}
                      />
                      <span className="text-[9px] font-semibold text-slate-500">{h.hour}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
              <span>Peak registration rush usually occurs between 08:00 and 11:30</span>
              <span className="font-semibold text-emerald-400">● Live Auto-refreshing</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading Analytics...</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
