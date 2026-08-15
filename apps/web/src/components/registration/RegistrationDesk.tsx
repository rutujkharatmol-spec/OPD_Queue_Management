"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Menu, X, PlusCircle, Search, Printer, CheckCircle2,
  Building2, ArrowRightLeft, AlertCircle, HeartPulse, User, Phone, FileText, QrCode
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { generateToken, getDepartments, searchTokens } from '../../lib/api';

export default function RegistrationDesk() {
  const searchParams = useSearchParams();
  const deptId = searchParams.get('deptId') || '660e8400-e29b-41d4-a716-446655440000';

  const [deptName, setDeptName] = useState<string>('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // Form State
  const [patientData, setPatientData] = useState({
    uhid: '',
    name: '',
    phone: '',
  });
  const [priority, setPriority] = useState<'NORMAL' | 'SENIOR' | 'EMERGENCY'>('NORMAL');

  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedTokenData, setGeneratedTokenData] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
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
    async function fetchDeptName() {
      try {
        const depts = await getDepartments();
        const found = depts.find((d: any) => d.id === deptId);
        if (found) {
          setDeptName(found.name);
        }
      } catch (err) {
        console.error('Failed to fetch departments', err);
      }
    }
    if (deptId) {
      fetchDeptName();
    }
  }, [deptId]);

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setGeneratedToken(null);

    try {
      const randomPatientId = crypto.randomUUID();
      const dummyDoctorId = "550e8400-e29b-41d4-a716-446655440000";

      const trimmedName = patientData.name.trim();
      const nameParts = trimmedName ? trimmedName.split(' ') : [];
      const firstName = nameParts[0] || 'Patient';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const phone = patientData.phone.trim();
      const uhid = patientData.uhid.trim();

      const token = await generateToken(deptId, randomPatientId, dummyDoctorId, priority, {
        firstName: firstName,
        lastName: lastName,
        phone: phone,
        uhid: uhid || undefined
      });

      setGeneratedToken(token.tokenNumber);
      setGeneratedTokenData({
        tokenNumber: token.tokenNumber,
        name: trimmedName || 'Patient',
        phone: phone || '---',
        uhid: uhid || token.patient?.uhid || '---',
        priority: priority,
        deptName: deptName || 'Medicine',
        issuedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err) {
      console.error(err);
      alert('Failed to generate token. Ensure API is running.');
    } finally {
      setIsGenerating(false);
    }
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
    setGeneratedToken(t.tokenNumber);
    setGeneratedTokenData({
      tokenNumber: t.tokenNumber,
      name: pName,
      phone: t.patient?.phone || '---',
      uhid: t.patient?.uhid || '---',
      priority: t.priority || 'NORMAL',
      deptName: t.department?.name || deptName || 'Medicine',
      issuedAt: t.issuedAt ? new Date(t.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'
    });
    setSearchModalOpen(false);
  };

  const handlePrintToken = () => {
    window.print();
  };

  const qrUrl = generatedToken ? `${appOrigin}/patient?token=${generatedToken}` : '';

  return (
    <div className="flex h-screen w-full bg-slate-100 font-sans overflow-hidden print:overflow-visible print:bg-white print:h-auto">

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 print:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black tracking-widest text-blue-400 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">AIIMS KALYANI</h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide mt-1 uppercase">OPD Registration</p>
            <div className="mt-2.5 inline-flex items-center gap-1.5 bg-blue-950/80 border border-blue-800/60 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wide">{deptName || 'Medicine'} OPD</span>
            </div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-3 overflow-y-auto">
          <Link href={`/?deptId=${deptId}`} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-900 hover:text-white transition-all group">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition-colors">🏠</div>
            <span className="font-semibold text-sm">Dashboard Home</span>
          </Link>
          <div className="h-px w-full bg-slate-800 my-2"></div>

          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-900/50 hover:shadow-blue-900/80 transition-all">
            <PlusCircle size={20} />
            <span className="text-sm">Generate Token</span>
          </button>

          <button
            onClick={() => setSearchModalOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-900 hover:text-white transition-all"
          >
            <Search size={20} />
            <span className="font-semibold text-sm">Find Patient / Reprint</span>
          </button>

          <Link href={`/analytics?deptId=${deptId}`} className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-900 hover:text-white transition-all group">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition-colors">📊</div>
            <span className="font-semibold text-sm">OPD Analytics</span>
          </Link>
        </nav>

        <div className="p-5 border-t border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold border border-blue-500/30">
              AK
            </div>
            <div>
              <p className="text-sm font-bold text-white">Amit Kumar</p>
              <p className="text-xs text-slate-400">Registration Desk</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg bg-slate-100 text-slate-600">
            <Menu size={24} />
          </button>
          <div className="text-center">
            <h2 className="font-bold text-slate-800 leading-tight">OPD Registration</h2>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-black border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {deptName || 'Medicine'} OPD
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">AK</div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 print:overflow-visible print:p-0">
          <div className="max-w-6xl mx-auto flex flex-col xl:flex-row gap-8 print:block print:max-w-none print:w-full">

            {/* Form Section */}
            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 lg:p-8 relative overflow-hidden print:hidden">
              <div className="relative z-10">

                {/* Department Banner */}
                <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center border border-white/30">
                      <Building2 size={26} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-100 bg-blue-900/60 px-2.5 py-0.5 rounded-full border border-blue-400/40">
                          Active Department
                        </span>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white">
                        {deptName ? `${deptName} OPD` : 'Medicine OPD'}
                      </h3>
                    </div>
                  </div>

                  <Link
                    href="/"
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2"
                  >
                    <ArrowRightLeft size={14} />
                    <span>Change Dept</span>
                  </Link>
                </div>

                <div className="mb-6 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">New Patient Entry</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Generate daily sequential OPD queue token.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchModalOpen(true)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-200"
                  >
                    <Search size={14} /> Find / Reprint Slip
                  </button>
                </div>

                <form onSubmit={handleGenerateToken} className="space-y-6">

                  {/* Priority Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Priority Level (Triage)
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setPriority('NORMAL')}
                        className={`p-3.5 rounded-2xl border text-sm font-bold flex flex-col items-center gap-1 transition-all ${priority === 'NORMAL'
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
                        className={`p-3.5 rounded-2xl border text-sm font-bold flex flex-col items-center gap-1 transition-all ${priority === 'SENIOR'
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
                        className={`p-3.5 rounded-2xl border text-sm font-bold flex flex-col items-center gap-1 transition-all ${priority === 'EMERGENCY'
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
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-lg ${isGenerating
                      ? 'bg-blue-400 cursor-not-allowed text-white/70'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/30'
                      }`}
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Daily Sequence...
                      </span>
                    ) : (
                      'Generate Token & Slip'
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Token Ticket Preview Section */}
            <div className="w-full xl:w-[380px] print:w-full">
              <div className={`h-full bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-500 print:shadow-none print:border-none print:p-0 ${generatedToken ? 'opacity-100' : 'opacity-90'}`}>

                {generatedToken && generatedTokenData ? (
                  <div className="w-full flex-1 flex flex-col print:block">
                    <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold mb-4 bg-emerald-50 py-2 rounded-xl border border-emerald-200 text-sm print:hidden">
                      <CheckCircle2 size={18} /> Token Ready for Print
                    </div>

                    {/* PHYSICAL PRINT TICKET */}
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
                          <span className="text-slate-500">Patient:</span>
                          <span className="font-bold">{generatedTokenData.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">UHID:</span>
                          <span className="font-mono font-bold">{generatedTokenData.uhid}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Mobile:</span>
                          <span className="font-mono">{generatedTokenData.phone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Issued Time:</span>
                          <span className="font-bold">{generatedTokenData.issuedAt}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-2 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-400">
                        Please watch TV monitors in the waiting hall.
                      </div>
                    </div>

                    <button
                      onClick={handlePrintToken}
                      className="mt-4 w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2 print:hidden"
                    >
                      <Printer size={20} /> Print Token Slip
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center px-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 mb-4">
                      <span className="text-3xl opacity-60">🎫</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">No Active Token</h3>
                    <p className="text-xs text-slate-500">Enter patient info and click Generate to preview slip &amp; QR code.</p>
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
              <button onClick={() => setSearchModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearch} className="my-4 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Enter phone, UHID, name, or MED-001..."
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center gap-2"
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
                      <p className="text-sm font-semibold text-slate-700 mt-1">{pName} ({t.patient?.phone || 'No phone'})</p>
                      <p className="text-xs text-slate-400">UHID: {t.patient?.uhid || '---'} • {t.department?.name || 'Medicine'} OPD</p>
                    </div>

                    <button
                      onClick={() => handleSelectSearchedToken(t)}
                      className="px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
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
