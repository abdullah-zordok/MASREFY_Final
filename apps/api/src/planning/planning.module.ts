import { Module } from '@nestjs/common';

import { DatabaseModule } from '../platform/database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { SecurityModule } from '../security/security.module';
import { PlanningController } from './planning.controller';
import { PlanningRepository } from './planning.repository';
import { PlanningService } from './planning.service';
import { PlanningWorker } from './planning.worker';

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [PlanningController],
  providers: [PlanningRepository, PlanningService],
  exports: [PlanningRepository, PlanningService],
})
export class PlanningModule {}

@Module({
  imports: [DatabaseModule],
  providers: [PlanningRepository, PlanningWorker],
  exports: [PlanningRepository, PlanningWorker],
})
export class PlanningWorkerModule {}
