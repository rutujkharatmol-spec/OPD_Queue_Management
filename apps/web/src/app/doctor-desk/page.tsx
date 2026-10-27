import { Suspense } from 'react';
import DoctorDesk from '../../components/doctor/DoctorDesk';

export default function DoctorDeskPage() {
  return (
    <Suspense fallback={<div className="p-10 text-slate-500">Loading...</div>}>
      <DoctorDesk />
    </Suspense>
  );
}
