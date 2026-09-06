import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../../src/app.module';
import { OperationsWorkerModule } from '../../../src/operations/operations.module';
import { SyncModule, SyncWorkerModule } from '../../../src/sync/sync.module';
import { WorkerModule } from '../../../src/worker.module';

describe('sync module registration', () => {
  it('registers API sync and nests the worker under the central operations owner', () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const workerImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];
    const operationsWorkerImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      OperationsWorkerModule,
    ) as unknown[];

    expect(appImports).toContain(SyncModule);
    expect(workerImports).toContain(OperationsWorkerModule);
    expect(operationsWorkerImports).toContain(SyncWorkerModule);
  });
});
