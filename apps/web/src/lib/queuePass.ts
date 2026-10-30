/**
 * Late patients. A patient called into a room who hasn't come in (the doctor scans their
 * booklet or taps "Came in") within this many minutes is late, and goes back in the line.
 */
export const LATE_AFTER_MINUTES = 5;

/** On this many-th time late, the patient is marked Absent (no-show) instead of moved back. */
export const ABSENT_AFTER_TIMES_LATE = 3;

/**
 * How many places a late patient goes back: 3 the first time, then 5, then 7. Each time
 * they are late again they lose more, as the hospital asked. `timesLateBefore` is the
 * token's pass count so far (manual Pass presses count too).
 */
export function latePassCount(timesLateBefore: number): number {
  return Math.min(50, 3 + 2 * Math.max(0, Math.floor(timesLateBefore)));
}

/**
 * Pass (+N): where a patient goes when they are not there when called.
 *
 * They go back N places: just behind the Nth patient of the same priority waiting after
 * them. Only the same priority counts, because emergencies and seniors are called ahead
 * of normal patients whatever their issue time, so "+3" is measured among the patients
 * this one actually queues with.
 *
 * A patient called into a room was at the front, so the count starts at the front of the
 * line. A patient still waiting counts from their own place; counting from the front
 * would move someone tenth in line up to fourth.
 *
 * Used by both the server route and the browser's offline copy, so the two agree.
 *
 * Returns the new issue time, or null to leave it unchanged (nobody of the same priority
 * is behind them, so they are already last in their group).
 */
export function passIssuedAt(
  /** Issue times of the other WAITING tokens with the same priority, department and day. */
  others: Date[],
  passCount: number,
  /** The patient's own issue time if they are still WAITING; null if they were called in. */
  waitingSince: Date | null
): Date | null {
  const after = waitingSince ? waitingSince.getTime() : -Infinity;
  const behind = others
    .map((d) => d.getTime())
    .filter((t) => t > after)
    .sort((a, b) => a - b);
  if (behind.length === 0) return null;

  const n = Math.max(1, Math.floor(passCount));
  // One millisecond after the patient they now follow. Issue times are normally at least
  // 50 ms apart, even for a printed batch, so this lands before the next patient. The
  // previous +1 second jumped over up to 20 batch-printed tokens at once.
  return new Date(behind[Math.min(n, behind.length) - 1] + 1);
}
