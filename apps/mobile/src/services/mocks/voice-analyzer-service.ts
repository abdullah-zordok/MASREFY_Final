import type { VoiceAnalyzerService } from '@/services/contracts/voice-capture-service';
import { VoiceCaptureError, voiceAnalyzerServiceCapability } from '@/services/contracts/voice-capture-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { fixtureProposalGroup, fixtureTranscript } from './voice-fixtures';
import { proposalToTransactionInput } from '@/domain/voice-capture';
import { coreFinanceService } from './core-finance-service';

const EMPTY_ANALYSIS_DELAY_MS = 1_500;

export function createMockVoiceAnalyzerService(): CapabilityProviderHandle<VoiceAnalyzerService> {
  return {
    metadata: {
      id: 'mock-voice-analyzer',
      capability: voiceAnalyzerServiceCapability.capability,
      majorVersion: voiceAnalyzerServiceCapability.majorVersion,
      kind: 'mock',
      availability: 'available'
    },
    async transcribe(_audioReference, scenario) {
      if (scenario === 'no_speech') throw new VoiceCaptureError('no_speech');
      if (scenario === 'background_noise') throw new VoiceCaptureError('background_noise');
      if (scenario === 'offline') throw new VoiceCaptureError('offline');
      return fixtureTranscript(scenario);
    },
    async analyze(input) {
      if (input.scenario === 'empty')
        await new Promise((resolve) => setTimeout(resolve, EMPTY_ANALYSIS_DELAY_MS));
      if (input.transcript.language === 'unsupported')
        throw new VoiceCaptureError('unsupported_language');
      try {
        return fixtureProposalGroup(input);
      } catch {
        throw new VoiceCaptureError('analysis_failed');
      }
    },
    async confirm(input) {
      const result = await coreFinanceService.createTransactionsAtomically(input.proposals.map(proposalToTransactionInput), input.operationId, 'voice');
      return { transactionIds: result.value.map(({ id }) => id), affectedScopes: result.affectedScopes };
    }
  };
}

export const voiceAnalyzerService = createMockVoiceAnalyzerService();
