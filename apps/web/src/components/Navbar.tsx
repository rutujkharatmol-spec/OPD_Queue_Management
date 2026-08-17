'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useDepartmentStore } from '../store/useDepartmentStore';
import { Building2, ChevronDown } from 'lucide-react';

function NavbarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlDeptId = searchParams.get('deptId');
  const { selectedDeptId, departments, isLoaded, setSelectedDeptId, loadDepartments, getEffectiveDeptId } = useDepartmentStore();

  const activeDeptId = getEffectiveDeptId(urlDeptId);

  useEffect(() => {
    loadDepartments(urlDeptId);
  }, [urlDeptId, loadDepartments]);

  // Keep store in sync if URL has a valid deptId
  useEffect(() => {
    if (urlDeptId && urlDeptId !== selectedDeptId) {
      setSelectedDeptId(urlDeptId);
    }
  }, [urlDeptId, selectedDeptId, setSelectedDeptId]);

  // Hide Navbar completely on the patient page as requested
  if (pathname.startsWith('/patient')) {
    return null;
  }

  const getHref = (path: string) => {
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

  const links = [
    { href: '/', label: 'Home' },
    { href: '/registration', label: 'Registration' },
    { href: '/doctor', label: 'Doctor Room' },
    { href: '/tv', label: 'TV Monitor' },
    { href: '/analytics', label: 'Analytics' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Brand Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link href={getHref('/')} className="text-xl font-black text-white tracking-wide flex items-center gap-2 hover:opacity-90 transition-opacity">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              OPD <span className="text-blue-400">Queue</span>
            </Link>
          </div>

          {/* Department Quick Switcher */}
          {pathname !== '/' && departments.length > 0 && (
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
