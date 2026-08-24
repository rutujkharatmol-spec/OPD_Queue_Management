"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../lib/api';

import { useDepartmentStore } from '../store/useDepartmentStore';

interface Department {
  id: string;
  name: string;
  code: string;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlDeptId = searchParams.get('deptId');

  // Narrow selectors: destructuring the hook subscribes to every store field, including
  // ones this screen never reads.
  const selectedDeptId = useDepartmentStore((state) => state.selectedDeptId);
  const departments = useDepartmentStore((state) => state.departments);
  const setSelectedDeptId = useDepartmentStore((state) => state.setSelectedDeptId);
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);

  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');

  const [isManagingDept, setIsManagingDept] = useState(false);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptCode, setEditDeptCode] = useState('');

  useEffect(() => {
    loadDepartments(urlDeptId);
  }, [urlDeptId, loadDepartments]);

  const fetchDepartments = async () => {
    await loadDepartments(urlDeptId);
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDepartment(newDeptName, newDeptCode);
      setIsAddingDept(false);
      setNewDeptName('');
      setNewDeptCode('');
      fetchDepartments();
    } catch (err) {
      console.error('Failed to add department', err);
      alert('Failed to add department. Please ensure API is running.');
    }
  };

  const openManageModal = () => {
    const dept = departments.find(d => d.id === selectedDeptId);
    if (dept) {
      setEditDeptName(dept.name);
      setEditDeptCode(dept.code);
      setIsManagingDept(true);
    }
  };

  const handleUpdateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptId) return;
    try {
      await updateDepartment(selectedDeptId, editDeptName, editDeptCode);
      setIsManagingDept(false);
      fetchDepartments();
    } catch (err) {
      console.error('Failed to update department', err);
      alert('Failed to update department.');
    }
  };

  const handleDeleteDepartment = async () => {
    if (!selectedDeptId) return;
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      await deleteDepartment(selectedDeptId);
      setIsManagingDept(false);
      setSelectedDeptId('');
      fetchDepartments();
    } catch (err) {
      console.error('Failed to delete department', err);
      alert('Failed to delete department. It might have existing rooms or tokens.');
    }
  };

  const getHref = (path: string) => {
    return selectedDeptId ? `${path}?deptId=${selectedDeptId}` : path;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden relative selection:bg-blue-500/30">
      
      {/* Top Navigation */}
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 z-20 flex flex-col sm:flex-row justify-between items-center gap-3">
        <button 
          onClick={openManageModal}
          disabled={!selectedDeptId}
          className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors border border-slate-700 shadow-lg flex items-center justify-center gap-2"
        >
          ⚙️ Manage Selected Dept
        </button>
        <button 
          onClick={() => setIsAddingDept(true)}
          className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors border border-slate-700 shadow-lg"
        >
          + ADD OPD Department
        </button>
      </div>

      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 blur-[100px] rounded-full animate-pulse-slow"></div>
      </div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] opacity-10 pointer-events-none animate-float">
        <div className="absolute inset-0 bg-emerald-500 blur-[120px] rounded-full"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-32 pb-12 md:py-20 flex flex-col items-center justify-center min-h-screen">
        
        {/* Header Section */}
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex items-center justify-center px-4 py-1.5 mb-4 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm font-semibold tracking-wide backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-blue-400 mr-2 animate-pulse"></span>
            System Online & Connected
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white via-blue-100 to-slate-400 drop-shadow-sm">
            AIIMS Kalyani <br/> OPD Queue System
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed">
            Enterprise-grade queue management hub.
          </p>
        </div>

        {/* Department Selector */}
        <div className="mb-16 flex flex-col items-center w-full max-w-md">
          <label className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">Which department do you want to manage?</label>
          {departments.length === 0 ? (
            <div className="text-slate-500 text-sm py-3">No departments found. Please add one first.</div>
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

        {/* Modules Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl transition-opacity duration-300 ${!selectedDeptId ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          
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
                <p className="text-slate-400 text-sm leading-relaxed">Generate new tokens, assign priorities, and manage patient entry into the OPD.</p>
              </div>
              <div className="mt-8 flex items-center text-blue-400 font-semibold text-sm group-hover:translate-x-2 transition-transform duration-300">
                Launch Module &rarr;
              </div>
            </div>
          </Link>

          {/* Card 2: Doctor Dashboard */}
          <Link href={getHref('/doctor')} className="group relative rounded-3xl p-[1px] bg-gradient-to-b from-slate-800 to-slate-900 hover:from-emerald-400 hover:to-teal-600 transition-all duration-500 hover:-translate-y-4">
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-400 to-teal-600 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative h-full bg-slate-900/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
              <div>
                <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2 tracking-wide">Doctor Room</h3>
                <p className="text-slate-400 text-sm leading-relaxed">High-efficiency control panel to call the next patient and view the live waiting queue.</p>
              </div>
              <div className="mt-8 flex items-center text-emerald-400 font-semibold text-sm group-hover:translate-x-2 transition-transform duration-300">
                Launch Module &rarr;
              </div>
            </div>
          </Link>

          {/* Card 3: TV Display */}
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

        </div>
      </div>

      {/* Add Department Modal */}
      {isAddingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Department</h2>
            <form onSubmit={handleAddDepartment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Department Name</label>
                <input 
                  type="text" 
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Orthopedics"
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Department Code (e.g. ORTHO)</label>
                <input 
                  type="text" 
                  value={newDeptCode}
                  onChange={e => setNewDeptCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. ORTHO"
                  required 
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddingDept(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Department Modal */}
      {isManagingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
            <h2 className="text-2xl font-bold text-white mb-6">Manage Department</h2>
            <form onSubmit={handleUpdateDepartment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Department Name</label>
                <input 
                  type="text" 
                  value={editDeptName}
                  onChange={e => setEditDeptName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Department Code</label>
                <input 
                  type="text" 
                  value={editDeptCode}
                  onChange={e => setEditDeptCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required 
                />
              </div>
              <div className="pt-4 flex justify-between gap-3">
                <button 
                  type="button" 
                  onClick={handleDeleteDepartment}
                  className="bg-red-600/10 hover:bg-red-600/20 text-red-500 font-semibold py-3 px-6 rounded-xl transition-colors border border-red-600/20"
                >
                  Delete
                </button>
                <div className="flex flex-1 gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsManagingDept(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
