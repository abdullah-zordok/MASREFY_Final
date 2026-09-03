import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../src/app.module';
import { TrackingModule, TrackingWorkerModule } from '../../src/tracking/tracking.module';
import { WorkerModule } from '../../src/worker.module';

describe('tracking module registration', () => {
  it('registers API and worker modules in only their process roots', () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const workerImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];
    expect(appImports).toContain(TrackingModule);
    expect(appImports).not.toContain(TrackingWorkerModule);
    expect(workerImports).toContain(TrackingWorkerModule);
    expect(workerImports).not.toContain(TrackingModule);
  });
});
