import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReportsWorker } from '../../../src/reports/reports.worker';
import type { ReportWorkOutcome } from '../../../src/reports/reports.repository';
import { describeLiveDatabase } from '../../live-database';

const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-09-04T00:00:00.000Z',
  ledgerVersion: 1,
  reportType: 'financial_summary',
  period: {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    timezone: 'Asia/Riyadh',
    kind: 'monthly',
  },
  format: 'pdf',
  delivery: 'email',
  currencyCode: 'SAR',
  dataState: 'empty',
  evidence: [],
  summary: {},
  breakdowns: [],
  detailedRows: [],
};

describe('report worker recovery', () => {
  it('terminalizes a post-DATA crash recovery without sending twice', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          Promise.resolve(kind === 'report.email.deliver' ? ['attempt'] : []),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (
            _kind: string,
            _id: string,
            action: (claim: never) => Promise<ReportWorkOutcome>,
          ) => {
            outcome = await action({
              id: '99000000-0000-4000-8000-000000000001',
              userId: 'owner',
              status: 'sending',
              snapshot,
              storageRef: 'private',
              expiresAt: '2026-09-05T00:00:00.000Z',
              attemptCount: 2,
            } as never);
          },
        ),
    };
    const smtp = { send: jest.fn() };
    const config = {
      getRequired: jest.fn(
        (key: string) =>
          (
            ({
              MASARIFI_REPORT_BATCH_SIZE: 10,
              MASARIFI_REPORT_MAX_BYTES: 1_000_000,
              MASARIFI_REPORT_MAX_ATTEMPTS: 3,
              MASARIFI_REPORT_SIGNED_URL_SECONDS: 300,
            }) as Record<string, number>
          )[key],
      ),
    };
    await new ReportsWorker(
      repository as never,
      { sign: jest.fn() } as never,
      config as never,
      undefined,
      smtp as never,
    ).runOnce();
    expect(smtp.send).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 'failed', errorCode: 'DELIVERY_ACCEPTANCE_UNKNOWN' });
  });

  it('leaves a failed Storage deletion retryable without losing its private reference', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          Promise.resolve(kind === 'report.output.expire' ? ['attempt'] : []),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (
            _kind: string,
            _id: string,
            action: (claim: never) => Promise<ReportWorkOutcome>,
          ) => {
            outcome = await action({
              id: '99000000-0000-4000-8000-000000000001',
              userId: 'owner',
              status: 'ready',
              snapshot: { ...snapshot, delivery: 'download' },
              storageRef: 'private',
              expiresAt: '2026-09-03T00:00:00.000Z',
              attemptCount: 1,
            } as never);
          },
        ),
    };
    const config = {
      getRequired: jest.fn((key: string) => (key === 'MASARIFI_REPORT_BATCH_SIZE' ? 10 : 3)),
    };
    await new ReportsWorker(
      repository as never,
      { delete: jest.fn().mockRejectedValue(new Error('offline')) } as never,
      config as never,
    ).runOnce();
    expect(outcome).toEqual({ status: 'failed', errorCode: 'REPORT_STORAGE_UNAVAILABLE' });
  });

  it('cleans an orphaned object before replaying a crashed generation claim', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const generationSnapshot = { ...snapshot, format: 'json', delivery: 'download' };
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          Promise.resolve(kind === 'report.generate' ? ['attempt'] : []),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (
            _kind: string,
            _id: string,
            action: (claim: never) => Promise<ReportWorkOutcome>,
          ) => {
            outcome = await action({
              id: '99000000-0000-4000-8000-000000000001',
              userId: 'owner',
              status: 'generating',
              snapshot: generationSnapshot,
              storageRef: null,
              expiresAt: '2026-09-05T00:00:00.000Z',
              attemptCount: 2,
            } as never);
          },
        ),
    };
    const storage = {
      key: jest.fn().mockReturnValue('private'),
      delete: jest.fn(),
      upload: jest.fn().mockResolvedValue({ key: 'private', bytes: 10 }),
      verify: jest.fn(),
    };
    const config = {
      getRequired: jest.fn(
        (key: string) =>
          (
            ({
              MASARIFI_REPORT_BATCH_SIZE: 10,
              MASARIFI_REPORT_MAX_BYTES: 1_000_000,
              MASARIFI_REPORT_MAX_ATTEMPTS: 3,
            }) as Record<string, number>
          )[key],
      ),
    };
    await new ReportsWorker(repository as never, storage as never, config as never).runOnce();
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(
      storage.upload.mock.invocationCallOrder[0] ?? 0,
    );
    expect(outcome).toMatchObject({ status: 'ready', storageRef: 'private' });
  });
});

describeLiveDatabase('report database recovery', () => {
  let pool: PoolService;

  beforeAll(() => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4),
    } as never);
  });

  afterAll(async () => pool.onModuleDestroy());

  it('preserves the N-1 query shape and restores one immutable attempt before a forward fix', async () => {
    const userId = `report_recovery_${randomUUID()}`;
    const attemptId = randomUUID();
    const storageRef = `reports/${'a'.repeat(64)}/${attemptId}.pdf`;

    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query(
          "insert into public.profiles(id,status,timezone) values($1,'active','Asia/Riyadh')",
          [userId],
        );
        await client.query(
          `insert into private.report_output_attempts(
             id,user_id,report_type,period_start,period_end,ledger_version,snapshot,
             storage_ref,delivery_status,expires_at
           ) values($1,$2,'financial_summary','2026-08-01','2026-08-31',1,$3::jsonb,$4,
             'ready',clock_timestamp()+interval '1 day')`,
          [attemptId, userId, JSON.stringify(snapshot), storageRef],
        );

        const legacyProfile = await client.query<{
          id: string;
          status: string;
          timezone: string;
        }>('select id,status,timezone from public.profiles where id=$1', [userId]);
        expect(legacyProfile.rows[0]).toEqual({
          id: userId,
          status: 'active',
          timezone: 'Asia/Riyadh',
        });

        await client.query(
          'create temporary table phase10_report_backup on commit drop as select * from private.report_output_attempts where id=$1',
          [attemptId],
        );
        await client.query('delete from private.report_output_attempts where id=$1', [attemptId]);
        await client.query(
          'insert into private.report_output_attempts select * from phase10_report_backup',
        );

        await client.query('savepoint invalid_forward_fix');
        await expect(
          client.query(
            "update private.report_output_attempts set delivery_status='delivered' where id=$1",
            [attemptId],
          ),
        ).rejects.toThrow('REPORT_TRANSITION_INVALID');
        await client.query('rollback to savepoint invalid_forward_fix');
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'worker', sub: userId }),
        ]);
        await client.query(
          "select private.transition_report_output($1,'failed',null,null,'REPORT_STORAGE_UNAVAILABLE')",
          [attemptId],
        );

        const restored = await client.query<{
          snapshot: typeof snapshot;
          storage_ref: string;
          delivery_status: string;
          error_code: string;
        }>(
          'select snapshot,storage_ref,delivery_status,error_code from private.report_output_attempts where id=$1',
          [attemptId],
        );
        expect(restored.rows[0]).toEqual({
          snapshot,
          storage_ref: storageRef,
          delivery_status: 'failed',
          error_code: 'REPORT_STORAGE_UNAVAILABLE',
        });
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });
});
