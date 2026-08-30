import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { DatabaseModule } from '../platform/database/database.module';
import { SecurityModule } from '../security/security.module';
import { LedgerController } from './ledger.controller';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { LedgerWorker } from './ledger.worker';

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [LedgerController],
  providers: [LedgerRepository, LedgerService],
  exports: [LedgerRepository, LedgerService],
})
export class LedgerModule {}

@Module({
  imports: [DatabaseModule],
  providers: [LedgerRepository, LedgerWorker],
  exports: [LedgerRepository, LedgerWorker],
})
export class LedgerWorkerModule {}
