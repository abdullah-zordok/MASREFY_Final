import { Module } from '@nestjs/common';

import { DatabaseModule } from '../platform/database/database.module';
import { IdentityModule, IdentityWorkerModule } from '../identity/identity.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { SecurityController } from './security.controller';
import { ExportStorage } from './export-storage';
import { SecurityRepository } from './security.repository';
import { SecurityService } from './security.service';
import { SecurityWorkerService } from './security.worker';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [SecurityController],
  providers: [SecurityRepository, SecurityService, AdminAuthGuard, ExportStorage],
  exports: [SecurityRepository, SecurityService, AdminAuthGuard],
})
export class SecurityModule {}

@Module({
  imports: [DatabaseModule, IdentityWorkerModule],
  providers: [SecurityRepository, ExportStorage, SecurityWorkerService],
  exports: [SecurityWorkerService],
})
export class SecurityWorkerModule {}
