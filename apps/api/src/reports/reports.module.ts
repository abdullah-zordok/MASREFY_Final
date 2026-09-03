import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { DatabaseModule } from '../platform/database/database.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsRepository, ReportsService],
})
export class ReportsModule {}

@Module({})
export class ReportsWorkerModule {}
