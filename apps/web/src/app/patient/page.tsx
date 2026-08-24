import { Metadata } from 'next';
import { Suspense } from 'react';
import PatientTracker from '../../components/patient/PatientTracker';

export const metadata: Metadata = {
  title: 'Patient Tracker | OPD Queue - AIIMS Kalyani',
  description: 'Check your live OPD queue status and estimated wait time in real-time.',
};

function PatientTrackerFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4" />
      <p className="text-sm font-bold text-slate-600">Loading Queue Tracker...</p>
    </div>
  );
}

export default function PatientPage() {
  return (
    <Suspense fallback={<PatientTrackerFallback />}>
      <PatientTracker />
    </Suspense>
  );
}
