import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { IdentityWorkerModule } from '../identity/identity.module';
import { DatabaseModule } from '../platform/database/database.module';
import { SecurityModule } from '../security/security.module';
import { ReportsController } from './reports.controller';
import { ReportsAdminController } from './reports.admin.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import { ReportsStorage } from './reports.storage';
import { ReportsSmtp } from './reports.smtp';
import { ReportsWorker } from './reports.worker';
import { ReportsWebhookController } from './reports.webhook.controller';

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ReportsController, ReportsAdminController, ReportsWebhookController],
  providers: [ReportsRepository, ReportsStorage, ReportsService],
  exports: [ReportsRepository, ReportsService],
})
export class ReportsModule {}

@Module({
  imports: [DatabaseModule, IdentityWorkerModule],
  providers: [ReportsRepository, ReportsStorage, ReportsSmtp, ReportsWorker],
  exports: [ReportsWorker],
})
export class ReportsWorkerModule {}
