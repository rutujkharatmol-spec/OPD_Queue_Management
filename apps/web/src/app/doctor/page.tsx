import { Suspense } from 'react';
import DoctorDashboard from '../../components/doctor/DoctorDashboard';

export default function DoctorPage() {
  return (
    <Suspense fallback={<div className="p-10 text-white">Loading...</div>}>
      <DoctorDashboard />
    </Suspense>
  );
}
