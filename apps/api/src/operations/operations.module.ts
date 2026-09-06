import { Module } from '@nestjs/common';

import { AiWorkerModule } from '../ai/ai.module';
import { EngagementWorkerModule } from '../engagement/engagement.module';
import { IdentityModule, IdentityWorkerModule } from '../identity/identity.module';
import { LedgerWorkerModule } from '../ledger/ledger.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { PlanningWorkerModule } from '../planning/planning.module';
import { DatabaseModule } from '../platform/database/database.module';
import { MetaModule } from '../platform/meta/meta.module';
import { ReportsWorkerModule } from '../reports/reports.module';
import { SecurityModule } from '../security/security.module';
import { SecurityWorkerModule } from '../security/security.module';
import { SyncWorkerModule } from '../sync/sync.module';
import { TrackingWorkerModule } from '../tracking/tracking.module';
import { OperationsController } from './operations.controller';
import { OperationsJobRegistry } from './job-registry';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';
import { OperationsWorker } from './operations.worker';

@Module({
  imports: [DatabaseModule, IdentityModule, MetaModule, SecurityModule],
  controllers: [OperationsController],
  providers: [OperationsRepository, OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}

@Module({
  imports: [
    DatabaseModule,
    OutboxModule,
    IdentityWorkerModule,
    SecurityWorkerModule,
    LedgerWorkerModule,
    SyncWorkerModule,
    PlanningWorkerModule,
    TrackingWorkerModule,
    AiWorkerModule,
    ReportsWorkerModule,
    EngagementWorkerModule,
  ],
  providers: [OperationsRepository, OperationsService, OperationsJobRegistry, OperationsWorker],
  exports: [OperationsWorker],
})
export class OperationsWorkerModule {}
