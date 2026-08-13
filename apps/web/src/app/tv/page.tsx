import { Suspense } from 'react';
import TvDisplay from '../../components/tv/TvDisplay';

export default function TvPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading TV Display...</div>}>
      <TvDisplay />
    </Suspense>
  );
}
