import { Module } from '@nestjs/common';

import { IdentityWorkerModule } from './identity/identity.module';
import { PlatformConfigModule } from './platform/config/platform-config.module';
import { OutboxModule } from './platform/outbox/outbox.module';

@Module({
  imports: [PlatformConfigModule, OutboxModule, IdentityWorkerModule],
})
export class WorkerModule {}
