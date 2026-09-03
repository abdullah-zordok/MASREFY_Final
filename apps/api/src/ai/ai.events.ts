import { hasForbiddenKey } from './ai.schemas';

export const AI_EVENT_TYPES = [
  'voice.proposal_ready.v1',
  'voice.proposal_confirmed.v1',
  'voice.proposal_failed.v1',
  'assistant.response_ready.v1',
  'assistant.action_confirmed.v1',
  'assistant.action_rejected.v1',
  'ai.fallback_used.v1',
  'ai.budget_threshold.v1',
  'ai.provider_failed.v1',
] as const;

export type AiEventType = (typeof AI_EVENT_TYPES)[number];
const types = new Set<string>(AI_EVENT_TYPES);

export function buildAiEvent(type: AiEventType, payload: Record<string, unknown>) {
  if (
    !types.has(type) ||
    hasForbiddenKey(payload) ||
    Object.keys(payload).some((key) =>
      /^(?:transcript|answer|prompt|audio|message|content)$/iu.test(key),
    ) ||
    JSON.stringify(payload).length > 4_096
  ) {
    throw new Error('AI_EVENT_PAYLOAD_INVALID');
  }
  return { type, payload } as const;
}
