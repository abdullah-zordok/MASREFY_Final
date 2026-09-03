import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DatabaseModule } from '../platform/database/database.module';
import { SecurityModule } from '../security/security.module';
import { TrackingAdminController } from './tracking-admin.controller';
import { TrackingController } from './tracking.controller';
import { TrackingRepository } from './tracking.repository';
import { TrackingService } from './tracking.service';
import { TrackingStorage } from './tracking.storage';
import { TrackingWorker } from './tracking.worker';

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule, LedgerModule],
  controllers: [TrackingController, TrackingAdminController],
  providers: [TrackingRepository, TrackingService, TrackingStorage],
  exports: [TrackingRepository, TrackingService],
})
export class TrackingModule {}

@Module({
  imports: [DatabaseModule, LedgerModule],
  providers: [TrackingRepository, TrackingStorage, TrackingWorker],
  exports: [TrackingWorker],
})
export class TrackingWorkerModule {}
