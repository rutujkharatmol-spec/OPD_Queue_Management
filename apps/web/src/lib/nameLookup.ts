/**
 * Patient-page "find my token by name" helpers, shared by the API route and the offline
 * local store so both give the same answers. No server or browser imports.
 */

/** Shortest name (letters, ignoring spaces) a lookup will search for. */
export const MIN_NAME_LOOKUP_CHARS = 3;
export const MAX_NAME_LOOKUP_RESULTS = 10;

export type NameLookupMatch = {
  tokenNumber: string;
  status: string;
  issuedAt: string | Date;
  departmentId: string;
  departmentName: string;
  /** Shortened, e.g. "Rahul K. S." */
  patientName: string;
};

/** Up to four words of the typed name, or [] when it is too short to search. */
export function nameLookupWords(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (clean.replace(/\s/g, '').length < MIN_NAME_LOOKUP_CHARS) return [];
  return clean.split(' ').slice(0, 4);
}

/** "Rahul Kumar Sharma" -> "Rahul K. S.": enough to recognise yourself, not a full listing. */
export function maskPatientName(firstName?: string | null, lastName?: string | null): string {
  const words = `${firstName ?? ''} ${lastName ?? ''}`.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const initials = words
    .slice(1)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => !!c)
    .map((c) => `${c.toUpperCase()}.`);
  return [words[0], ...initials].join(' ');
}

/**
 * Names given to tokens registered without one ("Patient", "Patient #12",
 * "Walk-in Patient"). Same rules the TV board uses to hide them.
 */
export function isPlaceholderPatientName(fullName?: string | null): boolean {
  // Keep only letters, digits, "#", "(", "-" and spaces so invisible characters can't hide a match.
  const lower = (fullName ?? '')
    .replace(/[^\p{L}\p{N}#(\s-]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return (
    lower === 'patient' ||
    lower === 'walk-in patient' ||
    lower === 'unknown patient' ||
    // "Patient 3", "Patient #3", "Patient (3)"
    /^patient\s*[#(]?\s*\d+/.test(lower)
  );
}
