import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../../../src/app.module';
import {
  EngagementModule,
  EngagementWorkerModule,
} from '../../../src/engagement/engagement.module';
import { WorkerModule } from '../../../src/worker.module';

describe('Phase 11 module boundary', () => {
  it('wires the API engagement module exactly once', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports.filter((value) => value === EngagementModule)).toHaveLength(1);
  });

  it('wires the worker engagement module exactly once', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkerModule) as unknown[];
    expect(imports.filter((value) => value === EngagementWorkerModule)).toHaveLength(1);
  });
});
