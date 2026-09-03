import { Module } from '@nestjs/common';

import { IdentityModule, IdentityWorkerModule } from '../identity/identity.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlanningModule } from '../planning/planning.module';
import { DatabaseModule } from '../platform/database/database.module';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { SecurityModule } from '../security/security.module';
import { TrackingModule } from '../tracking/tracking.module';
import { AiController } from './ai.controller';
import { AiAdminController } from './ai.admin.controller';
import { AiGateway } from './ai.gateway';
import { AiRepository } from './ai.repository';
import { AiService } from './ai.service';
import { AiStorage } from './ai.storage';
import { AiWorker } from './ai.worker';
import { AiNoStoreInterceptor } from './ai-no-store.interceptor';

@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    SecurityModule,
    LedgerModule,
    PlanningModule,
    TrackingModule,
  ],
  controllers: [AiController, AiAdminController],
  providers: [AiRepository, AiStorage, AiService, AiNoStoreInterceptor],
})
export class AiModule {}

@Module({
  imports: [DatabaseModule, IdentityWorkerModule],
  providers: [
    AiRepository,
    AiStorage,
    {
      provide: 'AI_GATEWAY',
      inject: [PlatformConfigService],
      useFactory: (config: PlatformConfigService) =>
        new AiGateway({ apiKey: config.get('OPENROUTER_API_KEY') }),
    },
    AiWorker,
  ],
  exports: [AiWorker],
})
export class AiWorkerModule {}
