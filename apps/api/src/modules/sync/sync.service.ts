import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Department } from '../departments/entities/department.entity';
import { User } from '../auth/entities/user.entity';
import { Patient } from '../patients/entities/patient.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Room } from '../settings/entities/room.entity';
import { Token } from '../tokens/entities/token.entity';
import { Queue } from '../queue/entities/queue.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { SyncState } from './entities/sync-state.entity';

/**
 * Tables in foreign-key-safe order. A row can only be pushed once every row it
 * references already exists in the cloud, so parents must come first:
 *   departments -> users -> patients -> doctors -> rooms -> tokens -> queues -> audit_logs
 */
const SYNC_ORDER = ['departments', 'users', 'patients', 'doctors', 'rooms', 'tokens', 'queues', 'audit_logs'];

/** Entities the cloud mirror needs so `synchronize` can build its schema. */
const CLOUD_ENTITIES = [Department, User, Patient, Doctor, Room, Token, Queue, AuditLog];

/** Rows pushed per table per tick. Caps memory and keeps a catch-up run from stalling the box. */
const BATCH_SIZE = 500;

/** Cursor origin, used when a table has never been synced. */
const EPOCH = '1970-01-01 00:00:00';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** Alias for the exact text form of updated_at; stripped before copying columns. */
const CURSOR_ALIAS = '__cursor_ts';

@Injectable()
export class SyncService implements OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private cloudDataSource: DataSource | null = null;
  private isSyncing = false;
  private lastSuccessAt: Date | null = null;
  private consecutiveFailures = 0;

  constructor(@InjectDataSource() private readonly local: DataSource) {}

  /**
   * The cloud mirror is opt-in. It is only enabled when CLOUD_SYNC_URL is set and
   * differs from the primary connection — otherwise an on-prem box misconfigured to
   * point at itself would sync a database to itself.
   */
  private get cloudUrl(): string | null {
    const url = process.env.CLOUD_SYNC_URL?.trim();
    if (!url) return null;
    if (url === process.env.DATABASE_URL?.trim()) {
      this.logger.warn('CLOUD_SYNC_URL equals DATABASE_URL — cloud sync disabled to avoid syncing a database to itself.');
      return null;
    }
    return url;
  }

  get isEnabled(): boolean {
    return this.cloudUrl !== null;
  }

  async onModuleDestroy() {
    if (this.cloudDataSource?.isInitialized) {
      await this.cloudDataSource.destroy().catch(() => undefined);
    }
  }

  private async getCloudConnection(): Promise<DataSource | null> {
    const url = this.cloudUrl;
    if (!url) return null;

    if (this.cloudDataSource?.isInitialized) return this.cloudDataSource;

    try {
      const ds = new DataSource({
        type: 'postgres',
        url,
        entities: CLOUD_ENTITIES,
        synchronize: true,
        // Keep a stalled uplink from pinning the request thread — the OPD must not
        // wait on the internet for anything.
        connectTimeoutMS: 10_000,
        extra: { max: 4, statement_timeout: 30_000 },
        logging: false,
      });

      await ds.initialize();
      this.cloudDataSource = ds;
      this.logger.log('Cloud mirror connected');
      return ds;
    } catch (error) {
      // Expected whenever the hospital's internet is down. Not an error condition.
      this.cloudDataSource = null;
      throw error;
    }
  }

  /**
   * Reads the cursor with raw SQL rather than the repository.
   *
   * The cursor must stay a string carrying Postgres' full microsecond precision, and
   * routing it through an ORM's type layer invites a silent coercion to a JS Date —
   * which truncates to milliseconds and leaves the cursor permanently behind the row
   * it just synced, re-pushing every row on every tick. Raw SQL with explicit casts
   * keeps that path unambiguous.
   */
  private async readCursor(tableName: string): Promise<{ at: string; id: string }> {
    const rows: { last_synced_at: string | null; last_synced_id: string | null }[] = await this.local.query(
      `SELECT last_synced_at, last_synced_id FROM sync_state WHERE table_name = $1`,
      [tableName]
    );

    return {
      at: rows[0]?.last_synced_at ?? EPOCH,
      id: rows[0]?.last_synced_id ?? ZERO_UUID,
    };
  }

  /** Records progress for a table. `$2::text` pins the cursor as an exact literal. */
  private async writeCursor(tableName: string, at: string, id: string, batchSize: number): Promise<void> {
    await this.local.query(
      `INSERT INTO sync_state (table_name, last_synced_at, last_synced_id, last_run_at, last_error, last_batch_size)
       VALUES ($1, $2::text, $3::uuid, now(), NULL, $4)
       ON CONFLICT (table_name) DO UPDATE SET
         last_synced_at  = EXCLUDED.last_synced_at,
         last_synced_id  = EXCLUDED.last_synced_id,
         last_run_at     = EXCLUDED.last_run_at,
         last_error      = NULL,
         last_batch_size = EXCLUDED.last_batch_size`,
      [tableName, at, id, batchSize]
    );
  }

  /** Records a failure without disturbing the cursor. */
  private async writeFailure(tableName: string, message: string): Promise<void> {
    await this.local.query(
      `INSERT INTO sync_state (table_name, last_run_at, last_error, last_batch_size)
       VALUES ($1, now(), $2, 0)
       ON CONFLICT (table_name) DO UPDATE SET
         last_run_at = EXCLUDED.last_run_at,
         last_error  = EXCLUDED.last_error`,
      [tableName, message]
    );
  }

  /**
   * Copies one batch of changed rows for a single table into the cloud.
   *
   * Rows are moved as raw tuples rather than hydrated entities: both databases run
   * the same Postgres schema, so a straight column-for-column copy avoids all
   * relation-mapping ambiguity and preserves foreign keys exactly as stored.
   *
   * Returns the number of rows pushed.
   */
  private async pushTable(cloud: DataSource, tableName: string): Promise<number> {
    const cursor = await this.readCursor(tableName);

    // Row-value comparison on (updated_at, id) gives a cursor that is both exact and
    // total: no row is skipped, none is pushed twice, and the cursor always advances
    // even when a whole batch shares one timestamp. The cursor is compared and carried
    // as text so Postgres does the parsing and full microsecond precision survives.
    const rows: Record<string, unknown>[] = await this.local.query(
      `SELECT *, updated_at::text AS ${CURSOR_ALIAS} FROM "${tableName}"
       WHERE (updated_at, id) > ($1::timestamp, $2::uuid)
       ORDER BY updated_at ASC, id ASC
       LIMIT $3`,
      [cursor.at, cursor.id, BATCH_SIZE]
    );

    if (rows.length === 0) return 0;

    // The cursor alias is a read-side helper, not a real column — never copy it.
    const columns = Object.keys(rows[0]).filter((c) => c !== CURSOR_ALIAS);
    const quoted = columns.map((c) => `"${c}"`).join(', ');

    const values: unknown[] = [];
    const tuples = rows.map((row) => {
      const placeholders = columns.map((col) => {
        values.push(row[col]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    // Never let a stale local row overwrite a newer cloud row. `<=` rather than `<`
    // because timestamp values (unlike the cursor above) do pass through JS Dates and
    // land in the mirror truncated to milliseconds; two edits inside the same
    // millisecond must still apply rather than being silently dropped as "not newer".
    const updates = columns
      .filter((c) => c !== 'id')
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(', ');

    await cloud.query(
      `INSERT INTO "${tableName}" (${quoted}) VALUES ${tuples.join(', ')}
       ON CONFLICT ("id") DO UPDATE SET ${updates}
       WHERE "${tableName}"."updated_at" <= EXCLUDED."updated_at"`,
      values
    );

    const lastRow = rows[rows.length - 1];
    await this.writeCursor(tableName, lastRow[CURSOR_ALIAS] as string, lastRow.id as string, rows.length);

    return rows.length;
  }

  /**
   * Pushes local changes to the cloud mirror. Runs on a timer and is entirely
   * best-effort: any failure is swallowed so that a dead internet connection can
   * never affect OPD operation.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async syncToCloud(): Promise<void> {
    if (!this.isEnabled || this.isSyncing) return;
    this.isSyncing = true;

    try {
      const cloud = await this.getCloudConnection();
      if (!cloud) return;

      let total = 0;
      for (const table of SYNC_ORDER) {
        // A failure on one table (say a not-yet-synced FK parent) must not block the rest.
        try {
          total += await this.pushTable(cloud, table);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Sync failed for "${table}": ${message}`);
          await this.writeFailure(table, message);
        }
      }

      this.lastSuccessAt = new Date();
      this.consecutiveFailures = 0;
      if (total > 0) this.logger.log(`Cloud mirror updated (${total} rows)`);
    } catch (error) {
      this.consecutiveFailures += 1;
      // Drop the handle so the next tick dials afresh rather than reusing a dead socket.
      if (this.cloudDataSource?.isInitialized) {
        await this.cloudDataSource.destroy().catch(() => undefined);
      }
      this.cloudDataSource = null;

      const message = error instanceof Error ? error.message : String(error);
      // Log loudly the first time, then stay quiet so an overnight outage doesn't
      // fill the disk with identical lines.
      if (this.consecutiveFailures === 1) {
        this.logger.warn(`Cloud mirror unreachable, running local-only: ${message}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /** Operational snapshot for the settings screen so staff can see the mirror is healthy. */
  async getStatus() {
    const states = this.isEnabled ? await this.local.getRepository(SyncState).find() : [];

    return {
      enabled: this.isEnabled,
      connected: this.cloudDataSource?.isInitialized ?? false,
      lastSuccessAt: this.lastSuccessAt,
      consecutiveFailures: this.consecutiveFailures,
      tables: states.map((s) => ({
        table: s.tableName,
        lastSyncedAt: s.lastSyncedAt,
        lastRunAt: s.lastRunAt,
        lastBatchSize: s.lastBatchSize,
        lastError: s.lastError,
      })),
    };
  }
}
