import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../../src/app.module';
import { SyncModule, SyncWorkerModule } from '../../../src/sync/sync.module';
import { WorkerModule } from '../../../src/worker.module';

describe('sync module registration', () => {
  it('registers the API and worker sync modules in their process roots', () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const workerImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];

    expect(appImports).toContain(SyncModule);
    expect(workerImports).toContain(SyncWorkerModule);
  });
});
