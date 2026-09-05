import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { IdentityModule } from './identity/identity.module';
import { LedgerModule } from './ledger/ledger.module';
import { PlatformConfigModule } from './platform/config/platform-config.module';
import { DatabaseModule } from './platform/database/database.module';
import { HealthModule } from './platform/health/health.module';
import { RequestIdMiddleware } from './platform/http/request-id.middleware';
import { MetaModule } from './platform/meta/meta.module';
import { ReferenceModule } from './reference/reference.module';
import { SecurityModule } from './security/security.module';
import { SyncModule } from './sync/sync.module';
import { PlanningModule } from './planning/planning.module';
import { TrackingModule } from './tracking/tracking.module';
import { AiModule } from './ai/ai.module';
import { ReportsModule } from './reports/reports.module';
import { EngagementModule } from './engagement/engagement.module';

@Module({
  imports: [
    PlatformConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    MetaModule,
    SecurityModule,
    ReferenceModule,
    LedgerModule,
    SyncModule,
    PlanningModule,
    TrackingModule,
    AiModule,
    ReportsModule,
    EngagementModule,
  ],
  providers: [RequestIdMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
