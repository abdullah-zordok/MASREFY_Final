import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { LedgerModule } from '../ledger/ledger.module';
import { DatabaseModule } from '../platform/database/database.module';
import { ReferenceModule } from '../reference/reference.module';
import { SyncController } from './sync.controller';
import { SyncHandlers } from './sync.handlers';
import { SyncRepository } from './sync.repository';
import { SyncService } from './sync.service';
import { SyncWorker } from './sync.worker';

@Module({
  imports: [DatabaseModule, IdentityModule, ReferenceModule, LedgerModule],
  controllers: [SyncController],
  providers: [SyncRepository, SyncService, SyncHandlers],
  exports: [SyncRepository, SyncService, SyncHandlers],
})
export class SyncModule {}

@Module({
  imports: [DatabaseModule, ReferenceModule, LedgerModule],
  providers: [SyncRepository, SyncHandlers, SyncWorker],
  exports: [SyncWorker],
})
export class SyncWorkerModule {}
