import { Suspense } from 'react';
import type { Metadata } from 'next';
import DoctorDesk from '../../components/doctor/DoctorDesk';

// The doctor's own screen, in the main menu with the app's top bar.
export const metadata: Metadata = {
  title: 'Doctor Desk | AIIMS Kalyani OPD',
};

export default function DoctorDeskPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 p-10 text-slate-500">Loading...</div>}>
      <DoctorDesk />
    </Suspense>
  );
}
