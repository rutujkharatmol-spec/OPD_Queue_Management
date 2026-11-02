import { ok, route } from '@/server/http';
import { patientCounts } from '@/server/patients/counts';

export const dynamic = 'force-dynamic';

/**
 * Patient numbers for the main page: registered and came today. Counts only, nothing
 * to change here; patients are edited and deleted in the admin panel.
 *
 * Staff only, like everything under /api/v1/patients (src/proxy.ts).
 */
export const GET = route(async () => ok(await patientCounts()));
