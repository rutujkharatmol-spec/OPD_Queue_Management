import { Suspense } from 'react';
import RegistrationDesk from '../../components/registration/RegistrationDesk';

export default function RegistrationPage() {
  return (
    <Suspense fallback={<div className="p-10 text-white">Loading...</div>}>
      <RegistrationDesk />
    </Suspense>
  );
}
