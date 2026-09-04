import { HttpException } from '@nestjs/common';

import { ReportsService } from '../../../src/reports/reports.service';
import { ReportsWorker } from '../../../src/reports/reports.worker';

describe('report output expiry', () => {
  const config = {
    get: jest.fn().mockReturnValue(300),
    getRequired: jest.fn().mockReturnValue(10),
  };

  it('deletes the private object before recording expiry', async () => {
    let outcome: unknown;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          Promise.resolve(kind === 'report.output.expire' ? ['id'] : []),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (_kind: string, _id: string, action: (claim: never) => Promise<unknown>) => {
            outcome = await action({
              id: '99000000-0000-4000-8000-000000000001',
              userId: 'owner',
              snapshot: {},
              status: 'ready',
              storageRef: 'reports/key',
              expiresAt: '2026-09-01T00:00:00.000Z',
              attemptCount: 1,
            } as never);
          },
        ),
    };
    const storage = { delete: jest.fn(), upload: jest.fn(), verify: jest.fn() };
    await new ReportsWorker(repository as never, storage as never, config as never).runOnce();
    expect(storage.delete).toHaveBeenCalledWith('reports/key');
    expect(outcome).toMatchObject({ status: 'expired', event: { type: 'report.expired' } });
  });

  it('never signs an expired output', async () => {
    const repository = {
      getAttempt: jest.fn().mockResolvedValue({
        id: 'id',
        status: 'ready',
        storageRef: 'reports/key',
        expiresAt: '2026-09-01T00:00:00.000Z',
      }),
    };
    const storage = { sign: jest.fn() };
    const service = new ReportsService(repository as never, storage as never, config as never);
    await expect(
      service.getReportAttempt(
        { userId: 'owner', sessionId: 's', factorAgeSeconds: 0 },
        '99000000-0000-4000-8000-000000000001',
        'request',
        new Date('2026-09-02T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(storage.sign).not.toHaveBeenCalled();
  });
});
