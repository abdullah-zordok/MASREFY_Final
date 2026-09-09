import type { CapabilityProviderHandle } from './contracts/capability-contract';
import {
  assistantServiceCapability,
  type AssistantService
} from './contracts/assistant-notifications-service';
import { isFixtureModeEnabled } from '@/config/demo-mode';
import { createLiveAssistantApiService } from './live/assistant-api-service';
import { getLiveClerkToken } from './live/auth-service';
import { assistantService as fixtureAssistantService } from './mocks/assistant-service';

const unavailable: CapabilityProviderHandle<AssistantService> = {
  metadata: {
    id: 'unavailable-assistant',
    capability: assistantServiceCapability.capability,
    majorVersion: assistantServiceCapability.majorVersion,
    kind: 'live',
    availability: 'unavailable'
  },
  getConsent: unavailableCall,
  getAvailability: unavailableCall,
  setConsent: unavailableCall,
  listConversations: unavailableCall,
  createConversation: unavailableCall,
  getConversation: unavailableCall,
  getResponse: unavailableCall,
  ask: unavailableCall,
  renameConversation: unavailableCall,
  deleteConversation: unavailableCall,
  setResponseFeedback: unavailableCall,
  getActionPreview: unavailableCall,
  updateActionPreview: unavailableCall,
  confirmAction: unavailableCall,
  cancelAction: unavailableCall
};
function unavailableCall(): never {
  throw new Error('assistant_unavailable');
}

export function selectAssistantService(
  fixtureMode: boolean,
  live: CapabilityProviderHandle<AssistantService>
): CapabilityProviderHandle<AssistantService> {
  return fixtureMode
    ? fixtureAssistantService
    : live.metadata.availability === 'available'
      ? live
      : unavailable;
}

export const assistantService = selectAssistantService(
  isFixtureModeEnabled(),
  createLiveAssistantApiService({ token: getLiveClerkToken })
);
