import type { CapabilityProviderHandle } from './contracts/capability-contract';
import {
  VoiceCaptureError,
  type VoiceAnalyzerService,
  voiceAnalyzerServiceCapability
} from './contracts/voice-capture-service';
import { voiceAnalyzerService as developmentVoiceAnalyzerService } from './mocks/voice-analyzer-service';
import { isFixtureModeEnabled } from '@/config/demo-mode';
import { createLiveVoiceApiService } from './live/voice-api-service';

const unavailableVoiceAnalyzerService: CapabilityProviderHandle<VoiceAnalyzerService> = {
  metadata: {
    id: 'unavailable-voice-analyzer',
    capability: voiceAnalyzerServiceCapability.capability,
    majorVersion: voiceAnalyzerServiceCapability.majorVersion,
    kind: 'live',
    availability: 'unavailable'
  },
  async transcribe() {
    throw new VoiceCaptureError('analysis_unavailable');
  },
  async analyze() {
    throw new VoiceCaptureError('analysis_unavailable');
  },
  async confirm() {
    throw new VoiceCaptureError('analysis_unavailable');
  }
};

export function selectVoiceAnalyzerService(
  fixtureMode: boolean,
  live: CapabilityProviderHandle<VoiceAnalyzerService>
): CapabilityProviderHandle<VoiceAnalyzerService> {
  return fixtureMode
  ? developmentVoiceAnalyzerService
  : live.metadata.availability === 'available'
    ? live
    : unavailableVoiceAnalyzerService;
}

export const voiceAnalyzerService = selectVoiceAnalyzerService(
  isFixtureModeEnabled(),
  createLiveVoiceApiService()
);
