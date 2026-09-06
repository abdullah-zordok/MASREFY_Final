import { Module } from '@nestjs/common';

import { IdentityModule } from '../../identity/identity.module';
import { DatabaseModule } from '../database/database.module';
import { MetaAuthGuard } from './meta-auth.guard';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [MetaController],
  providers: [MetaService, MetaAuthGuard],
  exports: [MetaService],
})
export class MetaModule {}
