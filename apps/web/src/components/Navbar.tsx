'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function NavbarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deptId = searchParams.get('deptId');

  // Hide Navbar completely on the patient page and home screen as requested
  if (pathname === '/' || pathname.startsWith('/patient')) {
    return null;
  }

  const getHref = (path: string) => {
    return deptId ? `${path}?deptId=${deptId}` : path;
  };

  const links = [
    { href: '/', label: 'Home' },
    { href: '/registration', label: 'Registration' },
    { href: '/doctor', label: 'Doctor Room' },
    { href: '/tv', label: 'TV Monitor' },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link href={getHref('/')} className="text-xl font-bold text-white tracking-wide">
              OPD <span className="text-blue-500">Queue</span>
            </Link>
          </div>
          <div className="flex overflow-x-auto">
            <div className="ml-4 md:ml-10 flex items-baseline space-x-2 md:space-x-4">
              {links.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={getHref(link.href)}
                    className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
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
