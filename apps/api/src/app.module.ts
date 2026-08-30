import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { IdentityModule } from './identity/identity.module';
import { LedgerModule } from './ledger/ledger.module';
import { PlatformConfigModule } from './platform/config/platform-config.module';
import { DatabaseModule } from './platform/database/database.module';
import { HealthModule } from './platform/health/health.module';
import { RequestIdMiddleware } from './platform/http/request-id.middleware';
import { MetaModule } from './platform/meta/meta.module';
import { ReferenceModule } from './reference/reference.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    PlatformConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    MetaModule,
    SecurityModule,
    ReferenceModule,
    LedgerModule,
  ],
  providers: [RequestIdMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
