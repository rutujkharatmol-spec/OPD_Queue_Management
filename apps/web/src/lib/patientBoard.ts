/**
 * The department board on the public patient page: token numbers and rooms only, no
 * patient names or UHIDs. Small and identical for every patient in a department, so
 * the server lets Vercel's CDN cache it for a few seconds (see /queue/live?view=patient).
 *
 * No server or browser imports, so the API route and the offline store share it.
 */

/** How many waiting tokens the board lists; the full count is in `waitingCount`. */
export const PATIENT_BOARD_WAITING_LIMIT = 20;

export type PatientBoard = {
  departmentName: string;
  rooms: Array<{ roomNumber: string }>;
  activeTokens: Array<{ tokenNumber: string; roomNumber: string }>;
  waitingTokens: Array<{ tokenNumber: string; priority: string }>;
  waitingCount: number;
};

/** Builds the patient board from the staff board's shape (used by the offline store). */
export function patientBoardFromStaffBoard(
  staff: {
    department?: string;
    activeTokens?: Array<{ token: string; room?: string }>;
    nextTokens?: string[];
  },
  rooms: Array<{ roomNumber: string; isActive?: boolean }>
): PatientBoard {
  const next = staff.nextTokens ?? [];
  return {
    departmentName: staff.department ?? '',
    rooms: rooms.filter((r) => r.isActive !== false).map((r) => ({ roomNumber: r.roomNumber })),
    activeTokens: (staff.activeTokens ?? []).map((t) => ({ tokenNumber: t.token, roomNumber: t.room || '101' })),
    waitingTokens: next.slice(0, PATIENT_BOARD_WAITING_LIMIT).map((s) => ({
      tokenNumber: s.replace(' 🚨', '').trim(),
      priority: s.includes('🚨') ? 'EMERGENCY' : 'NORMAL',
    })),
    waitingCount: next.length,
  };
}
