/**
 * A room's doctors, stored as one comma-separated name list in rooms.doctor_name
 * ("Dr. S. Roy, Dr. A. Das").
 *
 * Several doctors can share a room, and doctors move between rooms. A doctor is in one
 * room at a time, so putting a name on a room takes it off every other room. The list
 * is what the TV, the Doctor Desk and the room screens show; a patient is credited to
 * one doctor only when that is unambiguous (the doctor who pressed Done or called them
 * in, or the room's only doctor).
 *
 * Plain functions with no server or browser imports, so the API routes and the offline
 * local store treat the list the same way.
 */

/** Longest list kept on a room. */
export const MAX_ROOM_DOCTORS_LENGTH = 400;

export const cleanDoctorName = (name?: string | null) => (name ?? '').trim().replace(/\s+/g, ' ');

// "Dr. S. Roy" and "dr.  s. roy " are the same person.
export const doctorKey = (name: string) => cleanDoctorName(name).toLowerCase();

export const sameDoctor = (a?: string | null, b?: string | null) =>
  !!a && !!b && doctorKey(a) === doctorKey(b);

/** The names in a room's list, cleaned, in order, without repeats. */
export function splitDoctorNames(list?: string | null): string[] {
  if (!list) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of list.split(',')) {
    const name = cleanDoctorName(part);
    if (!name || seen.has(doctorKey(name))) continue;
    seen.add(doctorKey(name));
    names.push(name);
  }
  return names;
}

/** The list to store for these names, or null when there are none. */
export function joinDoctorNames(names: (string | null | undefined)[]): string | null {
  return splitDoctorNames(names.filter(Boolean).join(',')).join(', ') || null;
}

export function roomHasDoctor(list: string | null | undefined, name: string): boolean {
  return splitDoctorNames(list).some((n) => sameDoctor(n, name));
}

export function withDoctor(list: string | null | undefined, name: string): string | null {
  return joinDoctorNames([...splitDoctorNames(list), name]);
}

export function withoutDoctor(list: string | null | undefined, name: string): string | null {
  return joinDoctorNames(splitDoctorNames(list).filter((n) => !sameDoctor(n, name)));
}

export function withDoctorRenamed(list: string | null | undefined, oldName: string, newName: string): string | null {
  return joinDoctorNames(splitDoctorNames(list).map((n) => (sameDoctor(n, oldName) ? newName : n)));
}

/** The room's doctor when exactly one is set; null when none or several share it. */
export function soleDoctor(list?: string | null): string | null {
  const names = splitDoctorNames(list);
  return names.length === 1 ? names[0] : null;
}
