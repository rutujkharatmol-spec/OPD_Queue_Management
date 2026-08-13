"use client";
import React, { useState, useEffect } from 'react';
import { Search, Clock, AlertTriangle, CheckCircle2, User } from 'lucide-react';
import { getTokenStatus } from '../../lib/api';

export default function PatientTracker() {
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [statusData, setStatusData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = async (token: string) => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getTokenStatus(token);
      setStatusData(data);
      setActiveToken(token);
    } catch (err) {
      console.error(err);
      setError('Token not found. Please check your token number and try again.');
      setStatusData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenInput.trim()) {
      fetchStatus(tokenInput.trim().toUpperCase());
    }
  };

  // Poll for updates every 10 seconds if a token is active and waiting
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeToken && statusData?.status === 'WAITING') {
      interval = setInterval(() => {
        fetchStatus(activeToken);
      }, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeToken, statusData?.status]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 font-sans selection:bg-blue-500/30">
      <div className="w-full max-w-md mt-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Patient Queue Tracker</h1>
          <p className="text-slate-500 text-sm mt-2">Enter your token number to check your live queue status.</p>
        </div>

        {/* Input Form */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 mb-6">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input 
              type="text" 
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="e.g. MED-001" 
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 font-bold focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all uppercase"
              required
            />
            <button 
              type="submit" 
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-6 py-4 font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              {isLoading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search size={24} />}
            </button>
          </form>
          {error && <p className="text-red-500 text-sm mt-3 text-center font-medium">{error}</p>}
        </div>

        {/* Status Display */}
        {statusData && (
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden animate-fade-in">
            <div className={`p-6 text-center text-white ${
              statusData.status === 'WAITING' ? 'bg-blue-600' : 
              statusData.status === 'CALLED' ? 'bg-emerald-500' : 'bg-slate-700'
            }`}>
              <p className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1">Your Token</p>
              <h2 className="text-5xl font-black tracking-tighter drop-shadow-md">{statusData.tokenNumber}</h2>
              <div className="mt-4 inline-flex items-center gap-2 bg-white/20 px-4 py-1.5 rounded-full backdrop-blur-sm font-bold text-sm">
                {statusData.status === 'WAITING' && <><Clock size={16} /> Waiting</>}
                {statusData.status === 'CALLED' && <><CheckCircle2 size={16} /> Currently Serving</>}
                {statusData.status === 'COMPLETED' && 'Consultation Completed'}
                {statusData.status === 'ABSENT' && 'Marked Absent'}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Serving Info */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex justify-between items-center">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Department</p>
                  <p className="font-bold text-slate-800">{statusData.departmentName}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Serving Now</p>
                  <p className="font-black text-xl text-blue-600">
                    {statusData.currentlyServing?.length > 0 ? statusData.currentlyServing.join(', ') : 'None'}
                  </p>
                </div>
              </div>

              {/* Wait Time Info */}
              {statusData.status === 'WAITING' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100 text-center">
                      <h4 className="text-3xl font-black text-blue-600 mb-1">{statusData.patientsAhead}</h4>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Patients Ahead</p>
                    </div>
                    <div className="bg-orange-50/50 rounded-2xl p-5 border border-orange-100 text-center">
                      <h4 className="text-3xl font-black text-orange-600 mb-1">~{statusData.estimatedWaitTimeMins}</h4>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Mins Wait</p>
                    </div>
                  </div>

                  {/* Warning */}
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800">
                    <AlertTriangle className="shrink-0" size={20} />
                    <p className="text-sm font-medium leading-snug">
                      This estimated waiting time is not accurate and may fluctuate. Please ensure you are available near the consulting room early.
                    </p>
                  </div>
                </div>
              )}

              {statusData.status === 'CALLED' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center text-emerald-800">
                  <User className="mx-auto mb-2 opacity-50" size={32} />
                  <h3 className="font-bold text-lg mb-1">It's your turn!</h3>
                  <p className="text-sm">Please proceed to <strong>Room {statusData.roomNumber || 'assigned'}</strong> immediately.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
