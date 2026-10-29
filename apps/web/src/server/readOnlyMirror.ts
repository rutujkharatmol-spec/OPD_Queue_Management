/**
 * Read-only mirror switch.
 *
 * The plan is for the OPD server on the hospital network to own the data and for
 * Vercel to be a copy that patient phones read. Once that is live, set
 * READ_ONLY_MIRROR=true in the Vercel project so nobody can change the queue there by
 * mistake; two databases taking changes at once would drift apart.
 *
 * Off by default: today the registration and doctor computers work on Vercel, so
 * turning this on now would stop the clinic. Never set it on the OPD server.
 *
 * OPD_SERVER_URL (optional) is shown to staff who land on the read-only copy, so they
 * know where to go instead, e.g. http://192.168.1.50:3000
 */

export const READ_ONLY_CODE = 'READ_ONLY_MIRROR';

export function isReadOnlyMirror(): boolean {
  const value = process.env.READ_ONLY_MIRROR?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function opdServerUrl(): string | null {
  return process.env.OPD_SERVER_URL?.trim().replace(/\/+$/, '') || null;
}

export function readOnlyMessage(): string {
  const url = opdServerUrl();
  return url
    ? `This is the read-only copy of the OPD system. Make changes on the OPD server: ${url}`
    : 'This is the read-only copy of the OPD system. Make changes on the OPD server.';
}
