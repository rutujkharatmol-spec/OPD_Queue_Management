import { Metadata } from 'next';
import PatientTracker from '../../components/patient/PatientTracker';

export const metadata: Metadata = {
  title: 'Patient Tracker | OPD Queue',
  description: 'Check your live queue status and estimated wait time.',
};

export default function PatientPage() {
  return <PatientTracker />;
}
