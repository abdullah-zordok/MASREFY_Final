import { Test } from '@nestjs/testing';

import { LedgerRepository } from '../../src/ledger/ledger.repository';
import { LedgerWorker } from '../../src/ledger/ledger.worker';
import { ReportsSmtp } from '../../src/reports/reports.smtp';
import { WorkerModule } from '../../src/worker.module';

describe('ledger worker container registration', () => {
  it('registers the worker without an HTTP listener and completes one bounded batch', async () => {
    const reconcile = jest.fn().mockResolvedValue({ rows: [], nextCursor: null });
    const module = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(LedgerRepository)
      .useValue({ reconcile, recordReconciliationMismatch: jest.fn() })
      .overrideProvider(ReportsSmtp)
      .useValue({ send: jest.fn() })
      .compile();
    const worker = module.get(LedgerWorker);

    await expect(worker.runOnce()).resolves.toEqual({ rows: [], nextCursor: null });

    expect(reconcile).toHaveBeenCalledWith(null, 100);
    await module.close();
  });

  it('retains the cursor for a later retry and stops it before container shutdown completes', async () => {
    const reconcile = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ rows: [], nextCursor: null });
    const module = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(LedgerRepository)
      .useValue({ reconcile, recordReconciliationMismatch: jest.fn() })
      .overrideProvider(ReportsSmtp)
      .useValue({ send: jest.fn() })
      .compile();
    const worker = module.get(LedgerWorker);
    const stop = jest.spyOn(worker, 'stop');

    await expect(worker.runOnce()).rejects.toThrow('database unavailable');
    await expect(worker.runOnce()).resolves.toEqual({ rows: [], nextCursor: null });
    await module.close();

    expect(reconcile).toHaveBeenNthCalledWith(1, null, 100);
    expect(reconcile).toHaveBeenNthCalledWith(2, null, 100);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
