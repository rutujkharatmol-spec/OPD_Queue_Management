import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isAdmin } from '@/server/admin/auth';

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Settings is admin-only: reached from /admin, not the main menu.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect('/admin?next=/settings');
  return children;
}
