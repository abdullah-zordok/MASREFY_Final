import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { DatabaseModule } from '../platform/database/database.module';
import { SecurityModule } from '../security/security.module';
import { ReferenceController } from './reference.controller';
import { ReferenceRepository } from './reference.repository';
import { ReferenceService } from './reference.service';

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ReferenceController],
  providers: [ReferenceRepository, ReferenceService],
})
export class ReferenceModule {}
