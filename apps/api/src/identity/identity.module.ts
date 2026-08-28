import { Module } from '@nestjs/common';

import { DatabaseModule } from '../platform/database/database.module';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { META_TOKEN_VERIFIER, type MetaTokenVerifier } from '../platform/meta/meta-auth.guard';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkClientService } from './clerk-client.service';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookWorker } from './clerk-webhook.worker';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { PushTokenCrypto } from './push-token.crypto';

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController, ClerkWebhookController],
  providers: [
    ClerkClientService,
    ClerkAuthGuard,
    IdentityRepository,
    IdentityService,
    {
      provide: PushTokenCrypto,
      inject: [PlatformConfigService],
      useFactory: (config: PlatformConfigService): PushTokenCrypto => {
        const hashKey = Buffer.from(config.getRequired('MASARIFI_PUSH_TOKEN_HASH_KEY'), 'base64url');
        const keyRing = config.getRequired('MASARIFI_PUSH_TOKEN_ENCRYPTION_KEYS')
          .split(',')
          .map((entry) => {
            const separator = entry.indexOf(':');
            return {
              id: entry.slice(0, separator),
              key: Buffer.from(entry.slice(separator + 1), 'base64url'),
            };
          });
        return new PushTokenCrypto(hashKey, keyRing);
      },
    },
    {
      provide: META_TOKEN_VERIFIER,
      inject: [ClerkAuthGuard],
      useFactory: (guard: ClerkAuthGuard): MetaTokenVerifier => (token) => guard.verifyToken(token),
    },
  ],
  exports: [ClerkClientService, ClerkAuthGuard, IdentityRepository, META_TOKEN_VERIFIER],
})
export class IdentityModule {}

@Module({
  imports: [DatabaseModule],
  providers: [ClerkClientService, IdentityRepository, ClerkWebhookWorker],
  exports: [ClerkWebhookWorker],
})
export class IdentityWorkerModule {}
