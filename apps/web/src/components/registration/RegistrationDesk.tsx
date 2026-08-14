"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, PlusCircle, Search, Printer, CheckCircle2, Building2, ArrowRightLeft } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { generateToken, getDepartments } from '../../lib/api';

export default function RegistrationDesk() {
  const searchParams = useSearchParams();
  const deptId = searchParams.get('deptId') || '660e8400-e29b-41d4-a716-446655440000'; // fallback to old dummy id

  const [deptName, setDeptName] = useState<string>('');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [patientData, setPatientData] = useState({
    uhid: '',
    name: '',
    phone: '',
  });

  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
      const priorityEnum = 'NORMAL';

      // For testing, hardcoding valid v4 UUIDs for dept/doctor since we don't have a real auth/user select yet
      const randomPatientId = crypto.randomUUID();
      const dummyDoctorId = "550e8400-e29b-41d4-a716-446655440000";

      const nameParts = patientData.name.trim().split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      const token = await generateToken(randomPatientId, deptId, dummyDoctorId, priorityEnum, {
        firstName: firstName,
        lastName: lastName,
        phone: patientData.phone,
        uhid: patientData.uhid
      });
      setGeneratedToken(token.tokenNumber);
    } catch (err) {
      console.error(err);
      alert('Failed to generate token. Ensure API is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintToken = () => {
    window.print();
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden print:overflow-visible print:bg-white print:h-auto">
      
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
            <p className="text-xs text-slate-500 font-medium tracking-wide mt-1 uppercase">OPD Registration</p>
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
          
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-900 hover:text-white transition-all">
            <Search size={20} />
            <span className="font-semibold text-sm">Find Patient</span>
          </button>
        </nav>
        
        <div className="p-5 border-t border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold border border-blue-500/30">
              AK
            </div>
            <div>
              <p className="text-sm font-bold text-white">Amit Kumar</p>
              <p className="text-xs text-slate-500">Registration Desk</p>
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
        <div className="flex-1 overflow-y-auto p-4 lg:p-10 print:overflow-visible print:p-0">
          <div className="max-w-6xl mx-auto flex flex-col xl:flex-row gap-8 print:block print:max-w-none print:w-full">
            
            {/* Form Section */}
            <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white p-6 lg:p-10 relative overflow-hidden print:hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="relative z-10">
                
                {/* PROMINENT HIGH-VISIBILITY DEPARTMENT BANNER */}
                <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-xl shadow-blue-600/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-blue-400/40 relative overflow-hidden">
                  <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                  
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/25 shadow-inner shrink-0">
                      <Building2 size={28} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-100 bg-blue-900/60 px-2.5 py-0.5 rounded-full border border-blue-400/40">
                          Active OPD Department
                        </span>
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-sm">
                        {deptName ? `${deptName} Department` : 'Medicine Department'}
                      </h3>
                      <p className="text-blue-100/90 text-xs font-medium mt-0.5">
                        ⚠️ Please ensure patient requires consultation in this department before issuing token.
                      </p>
                    </div>
                  </div>

                  <Link 
                    href="/" 
                    className="self-stretch sm:self-auto px-4 py-2.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-xs rounded-xl backdrop-blur-md border border-white/30 transition-all shadow-md flex items-center justify-center gap-2 shrink-0"
                    title="Change department"
                  >
                    <ArrowRightLeft size={14} />
                    <span>Change Dept</span>
                  </Link>
                </div>

                <div className="mb-6">
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">New Patient Entry</h2>
                  <p className="text-slate-500 text-sm mt-1">Enter patient details below to generate an OPD queue token.</p>
                </div>
                
                <form onSubmit={handleGenerateToken} className="space-y-8">
                  {/* Demographics */}
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Patient Demographics</h3>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-100/80 px-2.5 py-1 rounded-lg border border-blue-200 w-fit">
                        <Building2 size={13} className="text-blue-600" />
                        Target: <strong className="font-black">{deptName ? `${deptName} OPD` : 'Medicine OPD'}</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                        <input 
                          type="text" 
                          required
                          value={patientData.name}
                          onChange={e => setPatientData({...patientData, name: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm" 
                          placeholder="E.g. Rahul Kumar" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Mobile Number</label>
                        <input 
                          type="tel" 
                          required
                          value={patientData.phone}
                          onChange={e => setPatientData({...patientData, phone: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm" 
                          placeholder="10-digit number" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">UHID (Optional)</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={patientData.uhid}
                            onChange={e => setPatientData({...patientData, uhid: e.target.value})}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm" 
                            placeholder="Enter existing UHID" 
                          />
                          <button type="button" className="px-5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 transition-colors shadow-md">
                            Fetch
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isGenerating}
                    className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-xl ${
                      isGenerating 
                        ? 'bg-blue-400 cursor-not-allowed text-white/70' 
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/30 hover:shadow-blue-500/50'
                    }`}
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </span>
                    ) : (
                      'Generate Secure Token'
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Token Preview Section - Responsive Width */}
            <div className="w-full xl:w-[400px] print:w-full">
              <div className={`h-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-700 print:shadow-none print:border-none print:p-0 ${generatedToken ? 'opacity-100 translate-y-0' : 'opacity-80 translate-y-4 xl:translate-y-0'}`}>
                
                {generatedToken ? (
                  <div className="w-full flex-1 flex flex-col animation-fade-in print:block">
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold mb-6 bg-emerald-50 py-2 rounded-full print:hidden">
                      <CheckCircle2 size={20} /> Successfully Generated
                    </div>
                    
                    {/* The Ticket Graphic */}
                    <div id="print-ticket" className="w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-8 relative shadow-inner flex-1 flex flex-col">
                      <div className="text-center mb-6">
                        <h4 className="font-black text-xl tracking-widest text-slate-800">AIIMS KALYANI</h4>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">OPD Registration</p>
                      </div>
                      
                      <div className="text-center py-8 border-y-2 border-dashed border-slate-200 my-2 flex-1 flex flex-col justify-center">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Token Number</p>
                        <h2 className="text-7xl font-black text-slate-900 tracking-tighter drop-shadow-sm">{generatedToken}</h2>
                      </div>
                      
                      <div className="mt-6 space-y-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Patient:</span>
                          <span className="font-bold text-slate-800">{patientData.name || 'Rahul Kumar'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-0.5">
                          <span className="text-slate-500 font-medium">Dept:</span>
                          <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-200 text-xs">
                            {deptName ? `${deptName} Dept` : 'Medicine Dept'}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Priority:</span>
                          <span className="font-bold text-slate-800">Normal</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-medium">Time:</span>
                          <span className="font-bold text-slate-800">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handlePrintToken} 
                      className="mt-6 w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-3 print:hidden"
                    >
                      <Printer size={24} /> Print Token
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center px-6">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200 mb-6">
                      <span className="text-4xl opacity-50">🎫</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">No Token Generated</h3>
                    <p className="text-sm">Fill out the patient details and click Generate to preview the ticket.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
