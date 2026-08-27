"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Menu, X, Search, Printer, CheckCircle2,
  Building2, ArrowRightLeft, HeartPulse, User, Phone, FileText, QrCode, Hash,
  Layers, Copy, Check, Sparkles, ChevronRight, Plus, Minus
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { generateToken, searchTokens, getRooms } from '../../lib/api';
import { addMultipleTokensToRoomQueue } from '../../lib/roomQueueSettings';

import { useDepartmentStore } from '../../store/useDepartmentStore';
import { useQueueStore } from '../../store/useQueueStore';

export default function RegistrationDesk() {
  const searchParams = useSearchParams();
  const requestedDeptId = searchParams.get('deptId');
  const selectedDeptId = useDepartmentStore((state) => state.selectedDeptId);
  const departments = useDepartmentStore((state) => state.departments);
  const setSelectedDeptId = useDepartmentStore((state) => state.setSelectedDeptId);
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);
  const getEffectiveDeptId = useDepartmentStore((state) => state.getEffectiveDeptId);

  const deptId = getEffectiveDeptId(requestedDeptId);
  const currentDept = departments.find((d) => d.id === deptId);
  const deptName = currentDept?.name || 'Department';

  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // Registration Mode: SINGLE vs BULK
  const [regMode, setRegMode] = useState<'SINGLE' | 'BULK'>('SINGLE');

  // Single Form State
  const [patientData, setPatientData] = useState({
    uhid: '',
    name: '',
    phone: '',
  });
  const [customTokenNumber, setCustomTokenNumber] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'SENIOR' | 'EMERGENCY'>('NORMAL');
  const [singleCount, setSingleCount] = useState<number>(1);

  // Bulk Form State
  const [bulkCount, setBulkCount] = useState<number>(5);
  const [bulkPriority, setBulkPriority] = useState<'NORMAL' | 'SENIOR' | 'EMERGENCY'>('NORMAL');
  const [bulkNamingType, setBulkNamingType] = useState<'WALKIN' | 'PREFIX' | 'LIST'>('WALKIN');
  const [bulkPrefix, setBulkPrefix] = useState('Walk-in');
  const [bulkListText, setBulkListText] = useState('');

  // Target Room / Queue Destination State
  const [availableRooms, setAvailableRooms] = useState<Array<{ id: string; roomNumber: string; doctorName?: string }>>([]);
  const [targetRoom, setTargetRoom] = useState<string>('GENERAL'); // 'GENERAL' | 'DISTRIBUTE' | roomNumber

  // Generated Output State
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedTokenData, setGeneratedTokenData] = useState<any>(null);
  const [generatedBatchList, setGeneratedBatchList] = useState<any[]>([]);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedTokens, setCopiedTokens] = useState(false);
  const [appOrigin, setAppOrigin] = useState('');

  // Find Patient Modal State
  const [isSearchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    loadDepartments(requestedDeptId);
  }, [requestedDeptId, loadDepartments]);

  useEffect(() => {
    if (deptId) {
      getRooms(deptId).then((data) => {
        if (Array.isArray(data)) setAvailableRooms(data);
      }).catch(() => {});
    }
  }, [deptId]);

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setGeneratedToken(null);
    setGeneratedBatchList([]);

    try {
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (regMode === 'SINGLE') {
        const randomPatientId = crypto.randomUUID();
        const dummyDoctorId = "550e8400-e29b-41d4-a716-446655440000";

        const trimmedName = patientData.name.trim();
        const nameParts = trimmedName ? trimmedName.split(' ') : [];
        const firstName = nameParts[0] || 'Patient';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        const phone = patientData.phone.trim();
        const uhid = patientData.uhid.trim();
        const cleanCustomToken = customTokenNumber.trim();
        const count = Math.max(1, Math.min(100, singleCount));

        const res = await generateToken(
          deptId,
          randomPatientId,
          dummyDoctorId,
          priority,
          {
            firstName: firstName,
            lastName: lastName,
            phone: phone,
            uhid: uhid || undefined
          },
          cleanCustomToken || undefined,
          count
        );

        const tokensArray = res.tokens || (Array.isArray(res) ? res : [res]);
        const formattedTokens = tokensArray.map((t: any, idx: number) => ({
          tokenNumber: t.tokenNumber,
          name: t.patient?.firstName ? `${t.patient.firstName} ${t.patient.lastName || ''}`.trim() : (trimmedName || `Patient ${count > 1 ? idx + 1 : ''}`.trim()),
          phone: t.patient?.phone || phone || '---',
          uhid: t.patient?.uhid || uhid || '',
          priority: t.priority || priority,
          deptName: deptName || 'Medicine',
          date: formattedDate,
          issuedAt: formattedTime
        }));

        setGeneratedBatchList(formattedTokens);
        setGeneratedToken(formattedTokens[0].tokenNumber);
        setGeneratedTokenData(formattedTokens[0]);
        setSelectedTokenIndex(0);
        setCustomTokenNumber('');

        // Auto-stage to room queue if target room selected
        if (targetRoom && targetRoom !== 'GENERAL') {
          const tokenNums = formattedTokens.map((t: any) => t.tokenNumber);
          if (targetRoom === 'DISTRIBUTE' && availableRooms.length > 0) {
            availableRooms.forEach((r, rIdx) => {
              const roomToks = tokenNums.filter((_, idx) => idx % availableRooms.length === rIdx);
              if (roomToks.length > 0) {
                addMultipleTokensToRoomQueue(deptId, r.roomNumber, roomToks);
              }
            });
          } else {
            addMultipleTokensToRoomQueue(deptId, targetRoom, tokenNums);
          }
        }

        // Refresh the queue store immediately
        await useQueueStore.getState().fetchQueue(deptId);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('opd-queue-updated', { detail: { departmentId: deptId } }));
        }
      } else {
        // BULK MULTI-TOKEN MODE
        let patientsList: Array<{ firstName?: string; lastName?: string; phone?: string; uhid?: string }> | undefined = undefined;
        let count = Math.max(1, Math.min(100, bulkCount));

        if (bulkNamingType === 'LIST' && bulkListText.trim()) {
          const lines = bulkListText.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            patientsList = lines.map(line => {
              const parts = line.split(',').map(p => p.trim());
              const nameParts = parts[0]?.split(' ') || [];
              return {
                firstName: nameParts[0] || 'Patient',
                lastName: nameParts.slice(1).join(' ') || '',
                phone: parts[1] || '',
                uhid: parts[2] || undefined,
              };
            });
            count = patientsList.length;
          }
        }

        const basePrefix = bulkNamingType === 'PREFIX' && bulkPrefix.trim() ? bulkPrefix.trim() : 'Walk-in';

        const res = await generateToken(
          deptId,
          undefined,
          undefined,
          bulkPriority,
          { firstName: basePrefix },
          undefined,
          count,
          patientsList
        );

        const tokensArray = res.tokens || (Array.isArray(res) ? res : [res]);
        const formattedTokens = tokensArray.map((t: any, idx: number) => ({
          tokenNumber: t.tokenNumber,
          name: t.patient ? `${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() : `Walk-in Patient #${idx + 1}`,
          phone: t.patient?.phone || '---',
          uhid: t.patient?.uhid || '',
          priority: t.priority || bulkPriority,
          deptName: deptName || 'Medicine',
          date: formattedDate,
          issuedAt: formattedTime
        }));

        setGeneratedBatchList(formattedTokens);
        setGeneratedToken(formattedTokens[0].tokenNumber);
        setGeneratedTokenData(formattedTokens[0]);
        setSelectedTokenIndex(0);

        // Auto-stage to room queue if target room selected
        if (targetRoom && targetRoom !== 'GENERAL') {
          const tokenNums = formattedTokens.map((t: any) => t.tokenNumber);
          if (targetRoom === 'DISTRIBUTE' && availableRooms.length > 0) {
            availableRooms.forEach((r, rIdx) => {
              const roomToks = tokenNums.filter((_, idx) => idx % availableRooms.length === rIdx);
              if (roomToks.length > 0) {
                addMultipleTokensToRoomQueue(deptId, r.roomNumber, roomToks);
              }
            });
          } else {
            addMultipleTokensToRoomQueue(deptId, targetRoom, tokenNums);
          }
        }

        // Refresh the queue store immediately
        await useQueueStore.getState().fetchQueue(deptId);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('opd-queue-updated', { detail: { departmentId: deptId } }));
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to generate token. Ensure API is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectBatchToken = (index: number) => {
    if (generatedBatchList[index]) {
      setSelectedTokenIndex(index);
      setGeneratedToken(generatedBatchList[index].tokenNumber);
      setGeneratedTokenData(generatedBatchList[index]);
    }
  };

  const handleCopyTokens = () => {
    if (generatedBatchList.length === 0) return;
    const text = generatedBatchList.map(t => t.tokenNumber).join(', ');
    navigator.clipboard.writeText(text);
    setCopiedTokens(true);
    setTimeout(() => setCopiedTokens(false), 2000);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchTokens(searchQuery.trim(), deptId);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchedToken = (t: any) => {
    const pName = t.patient ? (`${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() || 'Patient') : 'Patient';
    const tokenDate = t.issuedAt ? new Date(t.issuedAt) : new Date();
    const tokenItem = {
      tokenNumber: t.tokenNumber,
      name: pName,
      phone: t.patient?.phone || '---',
      uhid: t.patient?.uhid || '',
      priority: t.priority || 'NORMAL',
      deptName: t.department?.name || deptName || 'Medicine',
      date: tokenDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      issuedAt: t.issuedAt ? tokenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'
    };
    setGeneratedToken(t.tokenNumber);
    setGeneratedTokenData(tokenItem);
    setGeneratedBatchList([tokenItem]);
    setSelectedTokenIndex(0);
    setSearchModalOpen(false);
  };

  const handlePrintToken = () => {
    window.print();
  };

  const todayDateStr = new Intl.DateTimeFormat('en-CA').format(new Date());
  const qrUrl = generatedToken ? `${appOrigin}/patient?token=${generatedToken}&date=${todayDateStr}` : '';

  return (
    <div className="flex h-screen w-full bg-slate-100 font-sans overflow-hidden print:overflow-visible print:bg-white print:h-auto">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed lg:static top-0 bottom-0 left-0 w-64 bg-slate-900 text-white z-50 flex flex-col justify-between transition-transform duration-300 ease-in-out print:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}>
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xl shadow-lg shadow-blue-500/30">
                +
              </div>
              <div>
                <h1 className="font-bold text-base leading-tight">AIIMS KALYANI</h1>
                <p className="text-xs text-blue-400 font-medium">OPD Smart Desk</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white p-1"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4">
            <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Select OPD Clinic
            </p>
            <div className="space-y-1">
              {departments.map((dept) => {
                const isActive = dept.id === deptId;
                return (
                  <button
                    key={dept.id}
                    onClick={() => {
                      setSelectedDeptId(dept.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 size={16} />
                      <span className="truncate">{dept.name}</span>
                    </div>
                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/60 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              RD
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">Registration Desk</p>
              <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online &amp; Ready
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Registration Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto print:overflow-visible print:h-auto">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Patient Registration &amp; Token Desk
              </h2>
              <p className="text-xs text-slate-500">
                Current OPD: <span className="font-bold text-blue-600">{deptName}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer border border-slate-200"
            >
              <Search size={16} />
              <span className="hidden sm:inline">Find / Reprint Slip</span>
            </button>

            <Link
              href={`/doctor?deptId=${deptId}`}
              className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors border border-blue-200 flex items-center gap-1.5"
            >
              <span>Doctor Station</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </header>

        <div className="flex-1 p-6 max-w-7xl w-full mx-auto print:p-0 print:m-0">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
            {/* Left Registration Form Card */}
            <div className="xl:col-span-7 bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 print:hidden">
              <div>
                {/* Active Dept Header Card */}
                <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between shadow-md shadow-blue-500/20">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                      <HeartPulse size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-100 bg-blue-900/60 px-2.5 py-0.5 rounded-full border border-blue-400/40">
                          Active Department
                        </span>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white">{deptName} OPD</h3>
                    </div>
                  </div>
                  <Link href="/" className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2">
                    <ArrowRightLeft size={14} />
                    <span>Change Dept</span>
                  </Link>
                </div>

                {/* Mode Selector Tabs: Single vs Bulk */}
                <div className="mb-6 flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setRegMode('SINGLE')}
                    className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      regMode === 'SINGLE'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <User size={15} />
                    <span>Single Patient Registration</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegMode('BULK')}
                    className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      regMode === 'BULK'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Layers size={15} />
                    <span>⚡ Create Multiple Tokens at Once</span>
                  </button>
                </div>

                <form onSubmit={handleGenerateToken} className="space-y-6">
                  {regMode === 'SINGLE' ? (
                    <>
                      {/* Priority Selector */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Priority Level (Triage)
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                          <button
                            type="button"
                            onClick={() => setPriority('NORMAL')}
                            className={`p-3.5 rounded-2xl border text-sm font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${priority === 'NORMAL'
                              ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                          >
                            <span className="text-lg">🟢</span>
                            <span>Normal</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPriority('SENIOR')}
                            className={`p-3.5 rounded-2xl border text-sm font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${priority === 'SENIOR'
                              ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                          >
                            <span className="text-lg">🟡</span>
                            <span>Senior Citizen</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPriority('EMERGENCY')}
                            className={`p-3.5 rounded-2xl border text-sm font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${priority === 'EMERGENCY'
                              ? 'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-500/20 shadow-sm animate-pulse'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                          >
                            <span className="text-lg">🚨</span>
                            <span>Emergency</span>
                          </button>
                        </div>
                      </div>

                      {/* Demographics Inputs */}
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                            <User size={16} className="text-slate-400" /> Patient Full Name (Optional)
                          </label>
                          <input
                            type="text"
                            value={patientData.name}
                            onChange={e => setPatientData({ ...patientData, name: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            placeholder="E.g. Rahul Kumar (Leave blank for generic token)"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                              <Phone size={16} className="text-slate-400" /> Mobile Number (Optional)
                            </label>
                            <input
                              type="tel"
                              value={patientData.phone}
                              onChange={e => setPatientData({ ...patientData, phone: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                              placeholder="10-digit mobile (Optional)"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                              <FileText size={16} className="text-slate-400" /> UHID (Optional)
                            </label>
                            <input
                              type="text"
                              value={patientData.uhid}
                              onChange={e => setPatientData({ ...patientData, uhid: e.target.value })}
                              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                              placeholder="UHID-XXXXXX (Optional)"
                            />
                          </div>
                        </div>

                        {/* Custom Token Number Input */}
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Hash size={16} className="text-slate-400" /> Custom Token Number (Optional)
                            </span>
                            <span className="text-[11px] font-medium text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">
                              Auto-generated if blank
                            </span>
                          </label>
                          <input
                            type="text"
                            value={customTokenNumber}
                            onChange={e => setCustomTokenNumber(e.target.value.toUpperCase())}
                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono font-bold tracking-wider placeholder:font-normal placeholder:font-sans placeholder:tracking-normal"
                            placeholder="E.g. 101, 105, 42 (Auto if blank)"
                          />
                        </div>

                        {/* Number of Tokens to Issue (Family / Group Stepper) */}
                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-slate-700">Tokens Quantity</p>
                            <p className="text-[11px] text-slate-400">Issue multiple tokens for family / group</p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl p-1 shadow-xs">
                            <button
                              type="button"
                              onClick={() => setSingleCount(Math.max(1, singleCount - 1))}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors cursor-pointer"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={singleCount}
                              onChange={e => setSingleCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                              className="w-10 text-center font-black text-slate-900 text-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setSingleCount(Math.min(50, singleCount + 1))}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors cursor-pointer"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* BULK MULTI-TOKEN GENERATION MODE */
                    <>
                      {/* Quantity Selector with Quick Pills */}
                      <div className="bg-gradient-to-b from-blue-50/60 to-indigo-50/60 p-6 rounded-2xl border border-blue-200/80 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="block text-sm font-black text-slate-900 flex items-center gap-2">
                              <Layers size={18} className="text-blue-600" />
                              Number of Tokens to Create
                            </label>
                            <p className="text-xs text-slate-500">Batch-generate sequential tokens in one instant operation</p>
                          </div>

                          <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-xl p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => setBulkCount(Math.max(1, bulkCount - 5))}
                              className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center font-bold transition-colors cursor-pointer"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={bulkCount}
                              onChange={e => setBulkCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                              className="w-12 text-center font-black text-blue-950 text-base outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setBulkCount(Math.min(100, bulkCount + 5))}
                              className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center font-bold transition-colors cursor-pointer"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Quick Count Pills */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-500 mr-1">Quick Select:</span>
                          {[2, 5, 10, 20, 50, 100].map(cnt => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => setBulkCount(cnt)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                bulkCount === cnt
                                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-500/20'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
                              }`}
                            >
                              {cnt} Tokens
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Bulk Priority Selector */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Default Batch Priority
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                          <button
                            type="button"
                            onClick={() => setBulkPriority('NORMAL')}
                            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              bulkPriority === 'NORMAL'
                                ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span>🟢 Normal</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setBulkPriority('SENIOR')}
                            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              bulkPriority === 'SENIOR'
                                ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span>🟡 Senior</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setBulkPriority('EMERGENCY')}
                            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              bulkPriority === 'EMERGENCY'
                                ? 'bg-red-50 border-red-500 text-red-700 ring-2 ring-red-500/20 shadow-sm'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span>🚨 Emergency</span>
                          </button>
                        </div>
                      </div>

                      {/* Naming Options */}
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Batch Patient Naming Method
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <button
                              type="button"
                              onClick={() => setBulkNamingType('WALKIN')}
                              className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                                bulkNamingType === 'WALKIN'
                                  ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <p className="font-black">Auto Walk-in</p>
                              <p className="text-[10px] text-slate-400 font-normal">Walk-in Patient #1, #2...</p>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBulkNamingType('PREFIX')}
                              className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                                bulkNamingType === 'PREFIX'
                                  ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <p className="font-black">Custom Prefix</p>
                              <p className="text-[10px] text-slate-400 font-normal">e.g. Camp Patient, Eye OPD</p>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBulkNamingType('LIST')}
                              className={`p-3 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                                bulkNamingType === 'LIST'
                                  ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <p className="font-black">Paste Patient List</p>
                              <p className="text-[10px] text-slate-400 font-normal">Multiple names per line</p>
                            </button>
                          </div>
                        </div>

                        {bulkNamingType === 'PREFIX' && (
                          <div className="animate-in fade-in duration-150">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Custom Name Prefix
                            </label>
                            <input
                              type="text"
                              value={bulkPrefix}
                              onChange={e => setBulkPrefix(e.target.value)}
                              placeholder="E.g. Health Camp Patient, Referral Patient"
                              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
                            />
                          </div>
                        )}

                        {bulkNamingType === 'LIST' && (
                          <div className="animate-in fade-in duration-150">
                            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                              <span>Paste Patient Names (1 per line)</span>
                              <span className="text-[10px] text-slate-400 font-normal">Format: Name, Phone, UHID</span>
                            </label>
                            <textarea
                              rows={4}
                              value={bulkListText}
                              onChange={e => setBulkListText(e.target.value)}
                              placeholder="Rahul Kumar, 9876543210&#10;Anita Roy, 9123456780, UHID-1002&#10;Suresh Sen"
                              className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-800 outline-none focus:border-blue-500 font-mono"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Target Room / Queue Destination Selector */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building2 size={14} className="text-blue-600" />
                        Target Doctor Room / Queue Destination
                      </span>
                      {targetRoom !== 'GENERAL' && (
                        <span className="text-[10px] text-indigo-700 font-bold bg-indigo-100/80 px-2 py-0.5 rounded-md border border-indigo-200">
                          Direct Staging Active
                        </span>
                      )}
                    </label>
                    <select
                      value={targetRoom}
                      onChange={(e) => setTargetRoom(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="GENERAL">🌐 General Waiting Line (Any Doctor Room can call/pull)</option>
                      {availableRooms.length > 1 && (
                        <option value="DISTRIBUTE">⚡ Distribute Evenly Across All Active Rooms ({availableRooms.map((r) => `Room ${r.roomNumber}`).join(', ')})</option>
                      )}
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.roomNumber}>
                          🚪 Stage Directly to Room {r.roomNumber} Queue {r.doctorName ? `(${r.doctorName})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400">
                      {targetRoom === 'GENERAL'
                        ? 'Tokens enter the general line and can be called or staged by any room.'
                        : targetRoom === 'DISTRIBUTE'
                          ? 'Tokens will be distributed evenly into each doctor room’s dedicated queue.'
                          : `Tokens will appear directly in Room ${targetRoom}'s dedicated staged queue.`}
                    </p>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-lg cursor-pointer ${isGenerating
                      ? 'bg-blue-400 cursor-not-allowed text-white/70'
                      : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-blue-500/30'
                      }`}
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Generating {regMode === 'BULK' ? `${bulkCount} Tokens` : singleCount > 1 ? `${singleCount} Tokens` : 'Token'}...</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Sparkles size={20} />
                        <span>
                          {regMode === 'BULK'
                            ? `Generate ${bulkCount} Tokens at Once`
                            : singleCount > 1
                              ? `Generate ${singleCount} Tokens & Slips`
                              : 'Generate Token & Slip'}
                        </span>
                      </span>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Token Ticket Preview & Batch Slips Section */}
            <div className="xl:col-span-5 w-full print:w-full">
              <div className={`h-full bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-500 print:shadow-none print:border-none print:p-0 ${generatedToken ? 'opacity-100' : 'opacity-90'}`}>

                {generatedToken && generatedTokenData ? (
                  <div className="w-full flex-1 flex flex-col print:block">
                    
                    {/* Batch Summary / Status Banner */}
                    <div className="mb-4 print:hidden">
                      {generatedBatchList.length > 1 ? (
                        <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black text-xs">
                                <Check size={16} />
                              </div>
                              <div>
                                <h4 className="font-black text-xs text-emerald-950">
                                  {generatedBatchList.length} Tokens Generated Successfully!
                                </h4>
                                <p className="text-[10px] text-emerald-700">Click any token badge below to view &amp; preview</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleCopyTokens}
                              className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                              title="Copy all token numbers to clipboard"
                            >
                              {copiedTokens ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                              <span>{copiedTokens ? 'Copied!' : 'Copy List'}</span>
                            </button>
                          </div>

                          {/* Chips of All Generated Tokens in this Batch */}
                          <div className="flex gap-1.5 overflow-x-auto pb-1 max-h-24 flex-wrap">
                            {generatedBatchList.map((tok, idx) => (
                              <button
                                key={tok.tokenNumber}
                                type="button"
                                onClick={() => handleSelectBatchToken(idx)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                  selectedTokenIndex === idx
                                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 shadow-sm scale-105'
                                    : 'bg-white text-slate-700 border border-emerald-200 hover:bg-emerald-100/60'
                                }`}
                              >
                                {tok.tokenNumber}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold bg-emerald-50 py-2.5 rounded-xl border border-emerald-200 text-sm">
                          <CheckCircle2 size={18} /> Token Ready for Print
                        </div>
                      )}
                    </div>

                    {/* PHYSICAL PRINT TICKET (Preview of Currently Selected Token) */}
                    <div id="print-ticket" className="w-full bg-white border-2 border-dashed border-slate-400 rounded-2xl p-6 relative shadow-inner flex-1 flex flex-col print:border-black print:rounded-none">
                      <div className="text-center pb-4 border-b-2 border-dashed border-slate-300">
                        <h4 className="font-black text-lg tracking-widest text-slate-900">AIIMS KALYANI</h4>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Out-Patient Department (OPD)</p>
                        <span className="inline-block mt-1 text-xs font-black text-blue-700 bg-blue-50 px-3 py-0.5 rounded-full border border-blue-200">
                          {generatedTokenData.deptName} OPD
                        </span>
                      </div>

                      {/* Token Big Number */}
                      <div className="text-center py-6 border-b-2 border-dashed border-slate-300 flex-1 flex flex-col justify-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Queue Token Number</p>
                        <h2 className="text-5xl font-black text-slate-900 tracking-tight">{generatedTokenData.tokenNumber}</h2>
                        {generatedTokenData.priority === 'EMERGENCY' && (
                          <span className="mt-2 inline-block text-xs font-black text-red-600 bg-red-100 px-3 py-1 rounded-full uppercase tracking-wider">
                            🚨 Emergency Priority
                          </span>
                        )}
                        {generatedTokenData.priority === 'SENIOR' && (
                          <span className="mt-2 inline-block text-xs font-black text-amber-700 bg-amber-100 px-3 py-1 rounded-full uppercase tracking-wider">
                            🟡 Senior Citizen
                          </span>
                        )}
                      </div>

                      {/* QR Code on Ticket */}
                      <div className="my-4 flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                        {qrUrl && (
                          <QRCodeSVG
                            value={qrUrl}
                            size={100}
                            level="M"
                            includeMargin={false}
                          />
                        )}
                        <p className="text-[10px] font-bold text-slate-500 mt-2 flex items-center gap-1 justify-center">
                          <QrCode size={12} /> Scan with phone to track live position
                        </p>
                      </div>

                      {/* Ticket Metadata */}
                      <div className="space-y-1.5 text-xs text-slate-700 border-t border-slate-200 pt-3">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Date:</span>
                          <span className="font-bold">{generatedTokenData.date}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Patient:</span>
                          <span className="font-bold">{generatedTokenData.name}</span>
                        </div>
                        {generatedTokenData.uhid ? (
                          <div className="flex justify-between">
                            <span className="text-slate-500">UHID:</span>
                            <span className="font-mono font-bold">{generatedTokenData.uhid}</span>
                          </div>
                        ) : null}
                        {generatedTokenData.phone && generatedTokenData.phone !== '---' ? (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Mobile:</span>
                            <span className="font-mono">{generatedTokenData.phone}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between">
                          <span className="text-slate-500">Issued Time:</span>
                          <span className="font-bold">{generatedTokenData.issuedAt}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-2 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-400">
                        Please watch TV monitors in the waiting hall.
                      </div>
                    </div>

                    {/* Print Actions */}
                    <div className="space-y-2 mt-4 print:hidden">
                      {generatedBatchList.length > 1 ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handlePrintToken}
                            className="py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Printer size={15} /> Print This Slip
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              window.print();
                            }}
                            className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Printer size={15} /> Print All ({generatedBatchList.length}) Slips
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handlePrintToken}
                          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Printer size={20} /> Print Token Slip
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center px-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 mb-4">
                      <span className="text-3xl opacity-60">🎫</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">No Active Token</h3>
                    <p className="text-xs text-slate-500">Enter patient info or choose quantity to generate token slips.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Find Patient & Re-print Modal */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 flex flex-col max-h-[85vh] animate-in fade-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Search size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Find Patient / Reprint Token</h3>
                  <p className="text-xs text-slate-500">Search by Mobile Number, UHID, Patient Name, or Token Number</p>
                </div>
              </div>
              <button onClick={() => setSearchModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearch} className="my-4 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Enter phone, UHID, name, or token number (e.g. 101)..."
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </form>

            {/* Search Results List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
              {searchResults.map((t: any) => {
                const pName = t.patient ? (`${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() || 'Patient') : 'Patient';
                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-lg">{t.tokenNumber}</span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {t.status}
                        </span>
                        {t.priority === 'EMERGENCY' && (
                          <span className="text-[10px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-md">
                            🚨 Emergency
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-700 mt-1">{pName} {t.patient?.phone && t.patient.phone !== '0000000000' ? `(${t.patient.phone})` : ''}</p>
                      <p className="text-xs text-slate-400">{t.patient?.uhid ? `UHID: ${t.patient.uhid} • ` : ''}{t.department?.name || 'Medicine'} OPD</p>
                    </div>

                    <button
                      onClick={() => handleSelectSearchedToken(t)}
                      className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer size={14} /> Preview &amp; Print
                    </button>
                  </div>
                );
              })}

              {!isSearching && searchResults.length === 0 && searchQuery && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No matching tokens found for "{searchQuery}".
                </div>
              )}

              {!searchQuery && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Type a patient name, phone number, or token number to search records.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
