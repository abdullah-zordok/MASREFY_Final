import { Module } from '@nestjs/common';

import { DatabaseModule } from '../platform/database/database.module';
import { IdentityModule, IdentityWorkerModule } from '../identity/identity.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { SecurityController } from './security.controller';
import { ExportStorage } from './export-storage';
import { SecurityRepository } from './security.repository';
import { SecurityService } from './security.service';
import { SecurityWorkerService } from './security.worker';
import { TrackingPrivacyHandler } from '../tracking/tracking-privacy.handler';
import { TrackingStorage } from '../tracking/tracking.storage';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [SecurityController],
  providers: [SecurityRepository, SecurityService, AdminAuthGuard, ExportStorage],
  exports: [SecurityRepository, SecurityService, AdminAuthGuard],
})
export class SecurityModule {}

@Module({
  imports: [DatabaseModule, IdentityWorkerModule],
  providers: [
    SecurityRepository,
    ExportStorage,
    TrackingStorage,
    TrackingPrivacyHandler,
    SecurityWorkerService,
  ],
  exports: [SecurityWorkerService],
})
export class SecurityWorkerModule {}
