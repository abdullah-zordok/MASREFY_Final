import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../../src/app.module';
import {
  EngagementModule,
  EngagementWorkerModule,
} from '../../../src/engagement/engagement.module';
import { OperationsWorkerModule } from '../../../src/operations/operations.module';
import { WorkerModule } from '../../../src/worker.module';

describe('Phase 11 module boundary', () => {
  it('wires the API engagement module exactly once', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports.filter((value) => value === EngagementModule)).toHaveLength(1);
  });

  it('wires the worker engagement module exactly once', () => {
    const rootImports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      OperationsWorkerModule,
    ) as unknown[];
    expect(rootImports.filter((value) => value === OperationsWorkerModule)).toHaveLength(1);
    expect(imports.filter((value) => value === EngagementWorkerModule)).toHaveLength(1);
  });
});
