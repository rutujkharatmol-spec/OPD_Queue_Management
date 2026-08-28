import { Suspense } from 'react';
import TvDisplay from '../../components/tv/TvDisplay';

export default function TvPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-800 font-semibold">Loading TV Display...</div>}>
      <TvDisplay />
    </Suspense>
  );
}
