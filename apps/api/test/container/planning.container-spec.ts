import 'reflect-metadata';

import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../src/app.module';
import { OperationsWorkerModule } from '../../src/operations/operations.module';
import { PlanningModule, PlanningWorkerModule } from '../../src/planning/planning.module';
import { WorkerModule } from '../../src/worker.module';

describe('planning module registration', () => {
  it('registers API and worker planning modules in exactly their process roots', () => {
    const appImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const workerImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];
    const operationsImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      OperationsWorkerModule,
    ) as unknown[];

    expect(appImports).toContain(PlanningModule);
    expect(appImports).not.toContain(PlanningWorkerModule);
    expect(workerImports).toContain(OperationsWorkerModule);
    expect(workerImports).not.toContain(PlanningWorkerModule);
    expect(operationsImports).toContain(PlanningWorkerModule);
    expect(workerImports).not.toContain(PlanningModule);
  });
});
