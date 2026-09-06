import { Module } from '@nestjs/common';

import { PlatformConfigModule } from './platform/config/platform-config.module';
import { OperationsWorkerModule } from './operations/operations.module';

@Module({
  imports: [PlatformConfigModule, OperationsWorkerModule],
})
export class WorkerModule {}
