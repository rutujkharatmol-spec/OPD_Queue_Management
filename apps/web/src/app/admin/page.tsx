import type { Metadata } from 'next';
import { isAdmin } from '@/server/admin/auth';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminDashboard from '@/components/admin/AdminDashboard';

// Reached only by its link: not in the menu, and search engines are told to skip it.
export const metadata: Metadata = {
  title: 'Admin | AIIMS Kalyani OPD',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  return (await isAdmin()) ? <AdminDashboard /> : <AdminLogin />;
}
