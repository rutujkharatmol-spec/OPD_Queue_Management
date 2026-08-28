'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useDepartmentStore } from '../store/useDepartmentStore';
import {
  Building2, ChevronDown, Eye, Sliders, Check, X, RotateCcw,
  LayoutGrid, Users, Stethoscope, Zap, Sparkles, Layers,
  BookOpen, HelpCircle, ClipboardList, Tv, PhoneCall, Volume2,
  ArrowRight, ShieldAlert, CheckCircle2
} from 'lucide-react';
import {
  UiVisibilitySettings,
  DEFAULT_UI_SETTINGS,
  getUiVisibilitySettings,
  setUiVisibilitySettings,
  resetUiVisibilitySettings
} from '../lib/uiSettings';

function NavbarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlDeptId = searchParams.get('deptId');
  // Narrow selectors: the navbar is mounted on every screen, so subscribing it to the
  // whole store re-rendered it on any store write at all.
  const selectedDeptId = useDepartmentStore((state) => state.selectedDeptId);
  const departments = useDepartmentStore((state) => state.departments);
  const setSelectedDeptId = useDepartmentStore((state) => state.setSelectedDeptId);
  const loadDepartments = useDepartmentStore((state) => state.loadDepartments);
  const getEffectiveDeptId = useDepartmentStore((state) => state.getEffectiveDeptId);

  const activeDeptId = getEffectiveDeptId(urlDeptId);

  const [uiSettings, setUiSettingsState] = useState<UiVisibilitySettings>(DEFAULT_UI_SETTINGS);
  const [isShowUiOpen, setIsShowUiOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDepartments(urlDeptId);
    setUiSettingsState(getUiVisibilitySettings());

    const handleUpdate = () => {
      setUiSettingsState(getUiVisibilitySettings());
    };

    window.addEventListener('opd-ui-visibility-updated', handleUpdate);
    return () => {
      window.removeEventListener('opd-ui-visibility-updated', handleUpdate);
    };
  }, [urlDeptId, loadDepartments]);

  // Keep store in sync if URL has a valid deptId
  useEffect(() => {
    if (urlDeptId && urlDeptId !== selectedDeptId) {
      setSelectedDeptId(urlDeptId);
    }
  }, [urlDeptId, selectedDeptId, setSelectedDeptId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsShowUiOpen(false);
      }
    }
    if (isShowUiOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isShowUiOpen]);

  // Hide Navbar completely on the patient page as requested
  if (pathname.startsWith('/patient')) {
    return null;
  }

  const getHref = (path: string) => {
    if (path === '/settings' || path === '/guide') return path;
    return activeDeptId ? `${path}?deptId=${activeDeptId}` : path;
  };

  const handleDeptChange = (newDeptId: string) => {
    setSelectedDeptId(newDeptId);
    if (pathname === '/') {
      router.push(`/?deptId=${newDeptId}`);
    } else {
      router.push(`${pathname}?deptId=${newDeptId}`);
    }
  };

  const handleToggle = (key: keyof UiVisibilitySettings) => {
    const updated = setUiVisibilitySettings({
      [key]: !uiSettings[key],
    });
    setUiSettingsState(updated);
  };

  const handleResetAll = () => {
    const res = resetUiVisibilitySettings();
    setUiSettingsState(res);
  };

  const links = [
    { href: '/', label: 'Home' },
    { href: '/registration', label: 'Registration' },
    { href: '/doctor', label: 'Doctor Room' },
    { href: '/tv', label: 'TV Monitor' },
    { href: '/analytics', label: 'Analytics' },
    { href: '/guide', label: 'How to Use' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Brand Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link href={getHref('/')} className="text-xl font-black text-white tracking-wide flex items-center gap-2 hover:opacity-90 transition-opacity">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              OPD <span className="text-blue-400">Queue</span>
            </Link>
          </div>

          {/* Department Quick Switcher */}
          {uiSettings.showDeptSwitcher && pathname !== '/' && pathname !== '/settings' && departments.length > 0 && (
            <div className="relative flex items-center">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl px-3 py-1.5 text-xs text-slate-200 transition-all shadow-inner">
                <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <select
                  value={activeDeptId}
                  onChange={(e) => handleDeptChange(e.target.value)}
                  className="bg-transparent text-white font-semibold text-xs focus:outline-none appearance-none pr-4 cursor-pointer"
                  title="Switch Active Department"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 pointer-events-none -ml-3" />
              </div>
            </div>
          )}

          {/* Right Section: Show UI Dropdown Button + Navigation Links */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Show UI Controls Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsShowUiOpen(!isShowUiOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs ${
                  isShowUiOpen
                    ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/25'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/80 hover:border-slate-600'
                }`}
                title="Customize which UI sections are visible"
              >
                <Eye size={14} className={isShowUiOpen ? 'text-white' : 'text-blue-400'} />
                <span>Show UI</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isShowUiOpen ? 'rotate-180 text-white' : 'text-slate-400'}`} />
              </button>

              {/* Show UI Popover Modal / Menu */}
              {isShowUiOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-150 text-white flex flex-col gap-4">
                  
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
                        <Layers size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">Customize Visible UI</h3>
                        <p className="text-[11px] text-slate-400">Uncheck to hide sections across the app</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsShowUiOpen(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Checkbox Items */}
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    
                    {/* 1. Waiting Queue Sidebar */}
                    <label className="flex items-start gap-3 p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={uiSettings.showQueueSidebar}
                        onChange={() => handleToggle('showQueueSidebar')}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <Users size={13} className="text-blue-400" />
                          Waiting Line Queue Sidebar
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Show the left waiting line queue and drag-and-drop panel in Doctor Room. Uncheck for full-screen room cards.
                        </p>
                      </div>
                    </label>

                    {/* 2. Room Staged Queues */}
                    <label className="flex items-start gap-3 p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={uiSettings.showRoomStagedQueue}
                        onChange={() => handleToggle('showRoomStagedQueue')}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <LayoutGrid size={13} className="text-indigo-400" />
                          Room Staged Patient Queues
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Show the dedicated upcoming patient staging strip inside consultation room cards.
                        </p>
                      </div>
                    </label>

                    {/* 3. Auto-Call Controls */}
                    <label className="flex items-start gap-3 p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={uiSettings.showAutoCallToggle}
                        onChange={() => handleToggle('showAutoCallToggle')}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <Zap size={13} className="text-emerald-400" />
                          Auto-Call ⚡ Toggle Buttons
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Show the Auto-Call switch button on consultation room headers.
                        </p>
                      </div>
                    </label>

                    {/* 4. Doctor Names & Badges */}
                    <label className="flex items-start gap-3 p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={uiSettings.showDoctorNames}
                        onChange={() => handleToggle('showDoctorNames')}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <Stethoscope size={13} className="text-blue-400" />
                          Doctor Names &amp; Badges
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Show assigned doctor names underneath room numbers.
                        </p>
                      </div>
                    </label>

                    {/* 5. Header Quick Actions & Metrics */}
                    <label className="flex items-start gap-3 p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={uiSettings.showQuickActions}
                        onChange={() => handleToggle('showQuickActions')}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <Sparkles size={13} className="text-amber-400" />
                          Header Actions &amp; Pass (+N) Pill
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Show the Pass (+N) config pill and OPD Metrics button in room header.
                        </p>
                      </div>
                    </label>

                    {/* 6. Department Switcher */}
                    <label className="flex items-start gap-3 p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition-colors group">
                      <input
                        type="checkbox"
                        checked={uiSettings.showDeptSwitcher}
                        onChange={() => handleToggle('showDeptSwitcher')}
                        className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          <Building2 size={13} className="text-cyan-400" />
                          Navbar Department Switcher
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Show the active department selector dropdown in the top navbar.
                        </p>
                      </div>
                    </label>

                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={handleResetAll}
                      className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      <span>Reset All</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsShowUiOpen(false)}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>

                </div>
              )}
            </div>

            {/* Navigation Links */}
            <div className="flex overflow-x-auto scrollbar-none">
              <div className="flex items-baseline space-x-1 sm:space-x-2 md:space-x-3">
                {links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={getHref(link.href)}
                      className={`whitespace-nowrap px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Interactive How to Use Modal Popup */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200 text-white">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">How to Use OPD Queue</h2>
                  <p className="text-xs text-slate-400">Simple guide to using all features across the app</p>
                </div>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div className="py-5 space-y-4 overflow-y-auto pr-1 text-xs">
              {/* 1. Registration */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <ClipboardList size={16} />
                  <h3>1. Registration Desk (/registration)</h3>
                </div>
                <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                  <li><strong>Single Token:</strong> Enter patient name &amp; phone/UHID, click <em>Generate Token</em>.</li>
                  <li><strong>⚡ Bulk Tokens:</strong> Switch to <em>"Create Multiple Tokens at Once"</em> to generate batches of 5–10 tokens instantly for walk-in rushes.</li>
                  <li><strong>🚨 Priority:</strong> Choose Emergency Priority to place emergency patients at the top of the queue.</li>
                </ul>
              </div>

              {/* 2. Doctor Dashboard */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Stethoscope size={16} />
                  <h3>2. Doctor Consultation Room (/doctor)</h3>
                </div>
                <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                  <li><strong>Call Next:</strong> Click <em>"Call Next Patient"</em> to call the next patient into your room.</li>
                  <li><strong>⚡ Auto-Call:</strong> Turn Auto-Call ON to automatically call the next patient whenever you mark one Complete.</li>
                  <li><strong>Search &amp; Drag-and-Drop:</strong> Search any token number (or create a new one on the fly) and drag it into any room.</li>
                  <li><strong>Pass (+3):</strong> If a patient stepped away, click Pass to push them 3 spots back in line without losing them.</li>
                </ul>
              </div>

              {/* 3. TV Monitor */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Tv size={16} />
                  <h3>3. Waiting Hall TV Monitor (/tv)</h3>
                </div>
                <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                  <li><strong>Live Display:</strong> Displays called token numbers and consultation room numbers in giant text.</li>
                  <li><strong>🔊 Audio Announcements:</strong> Speaks patient calls out loud in English, Hindi, and Bengali.</li>
                  <li><strong>Light / Dark Mode:</strong> Clean high-contrast Light Mode default with Dark Mode toggle.</li>
                  <li><strong>Full Screen:</strong> Press <strong>'F'</strong> key on keyboard for borderless TV mode.</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between shrink-0">
              <Link
                href="/guide"
                onClick={() => setIsGuideOpen(false)}
                className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-colors"
              >
                <span>Open Full Guide Page</span>
                <ArrowRight size={13} />
              </Link>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export function Navbar() {
  return (
    <Suspense fallback={<div className="h-16 bg-slate-950 border-b border-slate-800"></div>}>
      <NavbarContent />
    </Suspense>
  );
}
