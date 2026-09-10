import type {
  ReportOutputAttempt,
  ReportSchedule,
  ReportScheduleDraft
} from '@/domain/reports';
import { projectNextDelivery } from '@/domain/reports';
import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';

export class ReportsRepository {
  private schedule: ReportSchedule | null = null;
  private draft: ReportScheduleDraft | null = null;
  private attempts = new Map<string, ReportOutputAttempt>();
  private operationIndex = new Map<string, string>();
  private hydration: Promise<void> | null = null;
  private hydratedDatabase: SQLiteDatabase | null = null;

  constructor(private readonly persistent = false) {}

  reset(): void {
    this.schedule = null;
    this.draft = null;
    this.attempts.clear();
    this.operationIndex.clear();
    this.hydration = null;
    this.hydratedDatabase = null;
  }

  async getSchedule(): Promise<ReportSchedule | null> {
    await this.ensureHydrated();
    return this.schedule;
  }

  async saveSchedule(
    schedule: ReportSchedule,
    expectedVersion: number | null
  ): Promise<ReportSchedule> {
    await this.ensureHydrated();
    if (this.schedule && expectedVersion !== this.schedule.version)
      throw new Error('conflict');
    this.schedule = {
      ...schedule,
      createdAt: this.schedule?.createdAt ?? schedule.createdAt,
      lastSuccessfulAttemptId:
        this.schedule?.lastSuccessfulAttemptId ??
        schedule.lastSuccessfulAttemptId
    };
    await this.persistSchedule();
    return this.schedule;
  }

  async setScheduleStatus(
    status: ReportSchedule['status'],
    expectedVersion: number,
    now = Date.now()
  ): Promise<ReportSchedule> {
    await this.ensureHydrated();
    if (!this.schedule) throw new Error('not_found');
    if (this.schedule.version !== expectedVersion) throw new Error('conflict');
    this.schedule = {
      ...this.schedule,
      status,
      version: this.schedule.version + 1,
      nextDeliveryAt:
        status === 'active' ? projectNextDelivery(this.schedule, now) : null,
      updatedAt: now
    };
    await this.persistSchedule();
    return this.schedule;
  }

  async saveDraft(draft: ReportScheduleDraft): Promise<ReportScheduleDraft> {
    await this.ensureHydrated();
    this.draft = draft;
    if (this.persistent) {
      await (
        await openDatabase()
      ).runAsync(
        'INSERT INTO planning_drafts (id, payload, kind, status, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, kind = excluded.kind, status = excluded.status, updated_at = excluded.updated_at',
        draft.id,
        JSON.stringify(draft),
        'report_schedule',
        draft.status,
        draft.updatedAt
      );
    }
    return draft;
  }

  async loadDraft(): Promise<ReportScheduleDraft | null> {
    await this.ensureHydrated();
    return this.draft;
  }

  async discardDraft(): Promise<void> {
    await this.ensureHydrated();
    this.draft = null;
    if (this.persistent)
      await (
        await openDatabase()
      ).runAsync('DELETE FROM planning_drafts WHERE id = ?', 'report_schedule');
  }

  async saveAttempt(
    attempt: ReportOutputAttempt
  ): Promise<ReportOutputAttempt> {
    await this.ensureHydrated();
    const existingId = this.operationIndex.get(attempt.operationId);
    if (existingId) return this.requireAttempt(existingId);
    if (attempt.retryOfAttemptId) {
      const source = this.attempts.get(attempt.retryOfAttemptId);
      const hasActiveOrSuccessfulRetry = [...this.attempts.values()].some(
        (item) =>
          item.retryOfAttemptId === attempt.retryOfAttemptId &&
          ['scheduled', 'sending', 'sent'].includes(item.status)
      );
      if (!source) throw new Error('not_found');
      if (source.status !== 'failed' || hasActiveOrSuccessfulRetry) {
        throw new Error('duplicate_request');
      }
    }
    this.operationIndex.set(attempt.operationId, attempt.id);
    this.attempts.set(attempt.id, attempt);
    if (
      attempt.status === 'sent' &&
      attempt.scheduleId &&
      this.schedule?.id === attempt.scheduleId
    ) {
      this.schedule = {
        ...this.schedule,
        lastSuccessfulAttemptId: attempt.id,
        updatedAt: attempt.completedAt ?? attempt.requestedAt
      };
    }
    await this.persistAttempt(attempt);
    return attempt;
  }

  async listAttempts(
    input: { scheduleId?: string; status?: ReportOutputAttempt['status'] } = {}
  ) {
    await this.ensureHydrated();
    return [...this.attempts.values()]
      .filter(
        (attempt) =>
          !input.scheduleId || attempt.scheduleId === input.scheduleId
      )
      .filter((attempt) => !input.status || attempt.status === input.status)
      .sort((a, b) => b.requestedAt - a.requestedAt);
  }

  async requireAttempt(id: string): Promise<ReportOutputAttempt> {
    await this.ensureHydrated();
    const attempt = this.attempts.get(id);
    if (!attempt) throw new Error('not_found');
    return attempt;
  }

  private async ensureHydrated(): Promise<void> {
    if (!this.persistent) return;
    const database = await openDatabase();
    if (this.hydratedDatabase !== database) {
      this.schedule = null;
      this.draft = null;
      this.attempts.clear();
      this.operationIndex.clear();
      this.hydratedDatabase = database;
      this.hydration = this.hydrate(database);
    }
    await this.hydration;
  }

  private async hydrate(database: SQLiteDatabase): Promise<void> {
    const [scheduleRows, draftRows, attemptRows] = await Promise.all([
      readPayloads<ReportSchedule>(database, 'report_schedules'),
      database.getAllAsync<{ payload: string }>(
        "SELECT payload FROM planning_drafts WHERE kind = 'report_schedule'"
      ),
      readPayloads<ReportOutputAttempt>(database, 'report_output_attempts')
    ]);
    this.schedule = scheduleRows[0] ?? null;
    this.draft = draftRows[0]
      ? (JSON.parse(draftRows[0].payload) as ReportScheduleDraft)
      : null;
    this.attempts = new Map(
      attemptRows.map((attempt) => [attempt.id, attempt])
    );
    this.operationIndex = new Map(
      attemptRows.map((attempt) => [attempt.operationId, attempt.id])
    );
  }

  private async persistSchedule(): Promise<void> {
    if (!this.persistent || !this.schedule) return;
    await persistSchedule(await openDatabase(), this.schedule);
  }

  private async persistAttempt(attempt: ReportOutputAttempt): Promise<void> {
    if (!this.persistent) return;
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      await transaction.runAsync(
        'INSERT INTO report_output_attempts (id, payload, operation_id, schedule_id, retry_of_attempt_id, kind, status, requested_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        attempt.id,
        JSON.stringify(attempt),
        attempt.operationId,
        attempt.scheduleId,
        attempt.retryOfAttemptId,
        attempt.kind,
        attempt.status,
        attempt.requestedAt,
        attempt.completedAt
      );
      if (this.schedule) await persistSchedule(transaction, this.schedule);
    });
  }
}

async function readPayloads<T>(
  database: Pick<SQLiteDatabase, 'getAllAsync'>,
  table: string
): Promise<T[]> {
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM ${table}`
  );
  return rows.map((row) => JSON.parse(row.payload) as T);
}

function persistSchedule(
  database: Pick<SQLiteDatabase, 'runAsync'>,
  schedule: ReportSchedule
): Promise<unknown> {
  return database.runAsync(
    'INSERT INTO report_schedules (id, payload, status, next_delivery_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, next_delivery_at = excluded.next_delivery_at, updated_at = excluded.updated_at',
    schedule.id,
    JSON.stringify(schedule),
    schedule.status,
    schedule.nextDeliveryAt,
    schedule.updatedAt
  );
}
