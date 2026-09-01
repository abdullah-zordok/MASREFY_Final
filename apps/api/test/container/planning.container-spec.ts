import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../src/app.module';
import { PlanningModule, PlanningWorkerModule } from '../../src/planning/planning.module';
import { WorkerModule } from '../../src/worker.module';

describe('planning module registration', () => {
  it('registers API and worker planning modules in exactly their process roots', () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const workerImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];

    expect(appImports).toContain(PlanningModule);
    expect(appImports).not.toContain(PlanningWorkerModule);
    expect(workerImports).toContain(PlanningWorkerModule);
    expect(workerImports).not.toContain(PlanningModule);
  });
});
