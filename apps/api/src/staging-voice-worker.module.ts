import { Module } from '@nestjs/common';
import { writeFileSync, renameSync } from 'node:fs';
import { AiWorkerModule } from './ai/ai.module';
import { AiRepository } from './ai/ai.repository';
import { AiStorage } from './ai/ai.storage';
import { AiWorker } from './ai/ai.worker';
import { StagingVoiceWorker } from './ai/staging-voice.worker';
import { PlatformConfigModule } from './platform/config/platform-config.module';
import { PlatformConfigService } from './platform/config/platform-config.service';
import { EngagementWorkerModule } from './engagement/engagement.module';
import { EngagementWorker } from './engagement/engagement.worker';

@Module({
  imports: [PlatformConfigModule, AiWorkerModule, EngagementWorkerModule],
  providers: [
    {
      provide: StagingVoiceWorker,
      inject: [AiRepository, AiWorker, AiStorage, PlatformConfigService, EngagementWorker],
      useFactory: (
        repository: AiRepository,
        engine: AiWorker,
        storage: AiStorage,
        config: PlatformConfigService,
        confirmations: EngagementWorker,
      ) => {
        const epoch = config.get('MASARIFI_STAGING_VOICE_EPOCH_ID');
        const source = config.get('MASARIFI_RELEASE_VERSION');
        if (
          !epoch ||
          !/^[a-f0-9]{40}$/.test(source) ||
          config.get('SUPABASE_URL') !== 'https://qcffvfbpzvpwcwxwjyro.supabase.co' ||
          config.get('MASARIFI_VOICE_ANALYSIS_ONLY') ||
          !config.get('MASARIFI_AI_PROVIDER_ENABLED') ||
          config.get('MASARIFI_AI_WORKER_POLL_MS') !== 500 ||
          config.get('MASARIFI_AI_JOB_BATCH_SIZE') !== 1 ||
          config.get('MASARIFI_AI_MAX_CONCURRENCY') !== 1 ||
          config.get('MASARIFI_AI_LEASE_SECONDS') !== 120
        ) {
          throw new Error('VOICE_SCOPED_RUNTIME_CONFIGURATION_INVALID');
        }
        return new StagingVoiceWorker(
          repository,
          engine,
          storage,
          epoch,
          config.get('MASARIFI_WORKER_ID') ?? `voice-${String(process.pid)}`,
          source,
          (state) => {
            writeFileSync('/tmp/staging-voice-health.next', JSON.stringify(state), { mode: 0o600 });
            renameSync('/tmp/staging-voice-health.next', '/tmp/staging-voice-health.json');
          },
          (epoch) => confirmations.processVoiceConfirmations(epoch),
        );
      },
    },
  ],
})
export class StagingVoiceWorkerModule {}
