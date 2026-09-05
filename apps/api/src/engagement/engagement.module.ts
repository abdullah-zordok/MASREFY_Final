import { Module } from '@nestjs/common';

import { IdentityModule, IdentityWorkerModule } from '../identity/identity.module';
import { DatabaseModule } from '../platform/database/database.module';
import { SecurityModule } from '../security/security.module';
import { EngagementAdminController, EngagementController } from './engagement.controller';
import { EngagementRepository } from './engagement.repository';
import { EngagementService } from './engagement.service';
import { SupportStorage } from './support.storage';
import { EngagementWorker } from './engagement.worker';
import { EngagementObservability } from './engagement.observability';

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [EngagementController, EngagementAdminController],
  providers: [
    EngagementRepository,
    EngagementService,
    SupportStorage,
    { provide: EngagementObservability, useFactory: () => new EngagementObservability() },
  ],
  exports: [EngagementRepository, EngagementService],
})
export class EngagementModule {}

@Module({
  imports: [DatabaseModule, IdentityWorkerModule],
  providers: [
    EngagementRepository,
    SupportStorage,
    { provide: EngagementObservability, useFactory: () => new EngagementObservability() },
    EngagementWorker,
  ],
  exports: [EngagementWorker],
})
export class EngagementWorkerModule {}
