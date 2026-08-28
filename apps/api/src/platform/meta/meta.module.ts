import { Module } from '@nestjs/common';

import { IdentityModule } from '../../identity/identity.module';
import { MetaAuthGuard } from './meta-auth.guard';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [IdentityModule],
  controllers: [MetaController],
  providers: [MetaService, MetaAuthGuard],
})
export class MetaModule {}
