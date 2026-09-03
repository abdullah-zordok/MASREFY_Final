import { Module } from '@nestjs/common';

import { IdentityWorkerModule } from './identity/identity.module';
import { LedgerWorkerModule } from './ledger/ledger.module';
import { PlatformConfigModule } from './platform/config/platform-config.module';
import { OutboxModule } from './platform/outbox/outbox.module';
import { SecurityWorkerModule } from './security/security.module';
import { SyncWorkerModule } from './sync/sync.module';
import { PlanningWorkerModule } from './planning/planning.module';
import { TrackingWorkerModule } from './tracking/tracking.module';
import { AiWorkerModule } from './ai/ai.module';
import { ReportsWorkerModule } from './reports/reports.module';

@Module({
  imports: [
    PlatformConfigModule,
    OutboxModule,
    IdentityWorkerModule,
    SecurityWorkerModule,
    LedgerWorkerModule,
    SyncWorkerModule,
    PlanningWorkerModule,
    TrackingWorkerModule,
    AiWorkerModule,
    ReportsWorkerModule,
  ],
})
export class WorkerModule {}
