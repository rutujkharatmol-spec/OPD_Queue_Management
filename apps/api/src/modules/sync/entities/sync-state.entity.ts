import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Per-table watermark for the local -> cloud push.
 *
 * Lives only in the local database and is never itself synced. Persisting the
 * watermark means a restart of the OPD server resumes where it left off instead
 * of re-pushing the entire history.
 */
@Entity('sync_state')
export class SyncState {
  /** Table name being tracked, e.g. "tokens". */
  @PrimaryColumn({ name: 'table_name' })
  tableName: string;

  /**
   * Cursor of the last row pushed, as (updated_at, id).
   *
   * The id is part of the cursor because updated_at alone is not unique: if more
   * rows share one timestamp than fit in a batch, a timestamp-only watermark stops
   * advancing and the same batch repeats forever.
   *
   * Stored as Postgres' own text literal rather than a timestamp, because the value
   * must never pass through a JavaScript Date. Postgres keeps microseconds and Date
   * only keeps milliseconds, so a Date round-trip truncates .803464 to .803000 —
   * leaving the cursor permanently behind the row it just synced, which makes every
   * row re-sync on every tick forever.
   */
  @Column({ name: 'last_synced_at', type: 'text', nullable: true })
  lastSyncedAt: string | null;

  @Column({ name: 'last_synced_id', type: 'uuid', nullable: true })
  lastSyncedId: string | null;

  /** Wall-clock time of the last completed attempt, successful or not. */
  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  /** Last failure message, cleared on success. Surfaced to staff via /sync/status. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  /** Rows pushed on the last successful run. */
  @Column({ name: 'last_batch_size', type: 'int', default: 0 })
  lastBatchSize: number;
}
