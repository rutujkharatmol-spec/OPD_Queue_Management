import { db } from '@/lib/db';
import { ok, route } from '@/server/http';
import { serviceDateFor } from '@/server/tokens/tokenNumber';
import {
  MAX_NAME_LOOKUP_RESULTS,
  isPlaceholderPatientName,
  maskPatientName,
  nameLookupWords,
  type NameLookupMatch,
} from '@/lib/nameLookup';

export const dynamic = 'force-dynamic';

/** Same date rules as /tokens/status, so a match found here can be tracked there. */
function parseServiceDate(dateQuery: string | null): Date {
  if (!dateQuery) return serviceDateFor();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateQuery.trim());
  if (match) {
    const [, y, m, d] = match.map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const parsed = new Date(dateQuery);
  return !isNaN(parsed.getTime()) ? serviceDateFor(parsed) : serviceDateFor();
}

/**
 * Public lookup for the patient page: find your token for a day by your name.
 *
 * Returns only what a patient needs to pick their own token. No phone, UHID or full
 * surname, unlike the staff search at /tokens/search.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const words = nameLookupWords(url.searchParams.get('name') || '');
  if (words.length === 0) return ok([]);

  const serviceDate = parseServiceDate(url.searchParams.get('date'));
  const departmentId = url.searchParams.get('departmentId') || undefined;

  const tokens = await db.token.findMany({
    where: {
      serviceDate,
      deletedAt: null,
      ...(departmentId ? { departmentId } : {}),
      // Every word typed must appear in the first or last name.
      AND: words.map((w) => ({
        OR: [
          { patient: { firstName: { contains: w, mode: 'insensitive' as const } } },
          { patient: { lastName: { contains: w, mode: 'insensitive' as const } } },
        ],
      })),
      // Placeholder names given to tokens registered without a name (see isPlaceholderPatientName).
      NOT: [
        { patient: { firstName: { equals: 'Patient', mode: 'insensitive' as const } } },
        { patient: { firstName: { startsWith: 'Patient #', mode: 'insensitive' as const } } },
        { patient: { firstName: { startsWith: 'Patient#', mode: 'insensitive' as const } } },
        { patient: { firstName: { equals: 'Walk-in Patient', mode: 'insensitive' as const } } },
        { patient: { firstName: { equals: 'Unknown Patient', mode: 'insensitive' as const } } },
      ],
    },
    select: {
      tokenNumber: true,
      status: true,
      issuedAt: true,
      departmentId: true,
      department: { select: { name: true } },
      patient: { select: { firstName: true, lastName: true } },
    },
    orderBy: { issuedAt: 'desc' },
    // Extra headroom for placeholder names the query can't express ("Patient 3").
    take: MAX_NAME_LOOKUP_RESULTS * 3,
  });

  const matches: NameLookupMatch[] = tokens
    .filter((t) => !isPlaceholderPatientName(`${t.patient?.firstName ?? ''} ${t.patient?.lastName ?? ''}`))
    .slice(0, MAX_NAME_LOOKUP_RESULTS)
    .map((t) => ({
    tokenNumber: t.tokenNumber,
    status: t.status,
    issuedAt: t.issuedAt,
    departmentId: t.departmentId ?? '',
    departmentName: t.department?.name ?? '',
    patientName: maskPatientName(t.patient?.firstName, t.patient?.lastName),
  }));
  return ok(matches);
});
