import type {
  AssistantConsent,
  AssistantActionInput,
  AssistantActionPreview,
  AssistantConversation,
  AssistantResponse,
  AssistantResponseFeedback
} from '@/domain/assistant';
import { assistantActionPreviewSchema, canTransitionPreview, cancelAssistantActionPreview, createAssistantActionPreview, createImmutableSnapshot, failAssistantActionPreview, previewRequiresConfirmation, revalidateAssistantActionPreview, updateAssistantActionPreviewInput } from '@/domain/assistant';
import type { MutationResult } from '@/services/contracts/core-finance-service';
import {
  assistantServiceCapability,
  type AssistantService
} from '@/services/contracts/assistant-notifications-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { buildAssistantContextSnapshot } from '@/features/assistant/assistant-context';
import { coreFinanceService } from './core-finance-service';
import { financialPlanningService } from './financial-planning-service';
import { reportsService } from './reports-service';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';

type ContextValue = Pick<AssistantResponse, 'dataAsOf' | 'period' | 'snapshot'>;
type SourceVersion = AssistantActionPreview['sourceVersions'][number];
type GoalOwnerInput = { title: string; targetMinor: number; currencyCode: string; targetDate: `${number}-${number}-${number}` };

export class AssistantServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AssistantServiceError';
  }
}

export function createMockAssistantService({
  now = Date.now,
  contextProvider = () => buildAssistantContextSnapshot({
    finance: coreFinanceService,
    planning: financialPlanningService,
    reports: reportsService,
    asOf: now(),
    period: { kind: 'monthly', anchorDate: '2026-01-01' },
    profile: { currencyCode: 'SAR', timeZone: 'Asia/Riyadh' }
  }),
  offline = false,
  remainingQuestions = 100,
  owners = {
    createGoal: (input: GoalOwnerInput, operationId: string) =>
      financialPlanningService.createGoal(input, operationId)
  },
  sourceVersionProvider,
  permissionProvider = async () => true,
  entitlementProvider = async () => true,
  registerForReset = false
}: {
  now?: () => number;
  contextProvider?: () => Promise<ContextValue>;
  offline?: boolean;
  remainingQuestions?: number;
  owners?: { createGoal: (input: GoalOwnerInput, operationId: string) => Promise<{ value: { id: string }; affectedScopes: readonly string[] }> };
  sourceVersionProvider?: () => Promise<readonly SourceVersion[]>;
  permissionProvider?: () => Promise<boolean>;
  entitlementProvider?: () => Promise<boolean>;
  registerForReset?: boolean;
} = {}): CapabilityProviderHandle<AssistantService> {
  let remaining = remainingQuestions;
  let consent = initialConsent();
  const conversations = new Map<string, AssistantConversation>();
  const responses = new Map<string, AssistantResponse>();
  const previews = new Map<string, AssistantActionPreview>();
  const operations = new Map<string, MutationResult<unknown>>();
  const currentSourceVersions = sourceVersionProvider ?? (async () => []);
  if (registerForReset)
    registerRuntimeUserDataReset(() => {
      remaining = remainingQuestions;
      consent = initialConsent();
      conversations.clear();
      responses.clear();
      previews.clear();
      operations.clear();
    });

  async function requireEnabled() {
    if (consent.status === 'not_requested') throw new AssistantServiceError('consent_required');
    if (consent.status === 'disabled') throw new AssistantServiceError('assistant_disabled');
  }

  async function makeResponse(conversationId: string, question: string, operationId: string): Promise<AssistantResponse> {
    if (offline) throw new AssistantServiceError('offline');
    if (remaining <= 0) throw new AssistantServiceError('limit_reached');
    let context: ContextValue;
    try {
      context = await contextProvider();
    } catch (error) {
      if (error instanceof AssistantServiceError) throw error;
      throw new AssistantServiceError('representative_failure');
    }
    const id = `response-${operationId}`;
    remaining -= 1;
    const responseType = responseTypeFor(question);
    const preview = responseType === 'plan' || responseType === 'saving_suggestion'
      ? createGoalPreview(`preview-${operationId}`, id, context)
      : responseType === 'safe_redirect'
        ? createNavigationPreview(`preview-${operationId}`, id, 'show_subscriptions')
        : null;
    if (preview) previews.set(preview.id, preview);
    return deepFreeze({
      id,
      conversationId,
      question,
      responseType,
      blocks: responseBlocks(responseType, context.snapshot.values),
      period: context.period,
      dataAsOf: context.dataAsOf,
      snapshot: createImmutableSnapshot(JSON.parse(JSON.stringify(context.snapshot))),
      limitations: [...context.snapshot.completeness.reasons, ...responseLimitations(responseType)],
      proposedActionIds: preview ? [preview.id] : [],
      feedback: null,
      createdAt: now()
    });
  }

  return {
    metadata: {
      id: 'mock-assistant',
      capability: assistantServiceCapability.capability,
      majorVersion: assistantServiceCapability.majorVersion,
      kind: 'mock',
      availability: offline ? 'unavailable' : 'available'
    },
    async getConsent() {
      return consent;
    },
    async getAvailability() {
      return {
        status: consent.status === 'disabled' ? 'disabled' : remaining <= 0 ? 'limit_reached' : 'available',
        remainingQuestions: remaining
      };
    },
    async listInsights() {
      return [];
    },
    async setConsent(enabled: boolean, expectedVersion: number, operationId: string) {
      const replay = operations.get(operationId) as MutationResult<AssistantConsent> | undefined;
      if (replay) return replay;
      if (consent.version !== expectedVersion) throw new AssistantServiceError('conflict');
      consent = {
        status: enabled ? 'enabled' : 'disabled',
        disclosedDataCategories: ['transactions', 'planning', 'reports'],
        consentedAt: enabled ? now() : null,
        disabledAt: enabled ? null : now(),
        version: consent.version + 1
      };
      return remember(operationId, consent, ['assistant.consent', 'assistant.availability', 'assistant.context']);
    },
    async listConversations(input: { pageSize?: number; cursor?: string; status?: AssistantConversation['status'] } = {}) {
      const status = input.status ?? 'active';
      const active = [...conversations.values()].filter((item) => item.status === status).sort((a, b) => b.updatedAt - a.updatedAt);
      const start = input.cursor ? Number(input.cursor) : 0;
      const pageSize = input.pageSize ?? 20;
      return { items: active.slice(start, start + pageSize), nextCursor: start + pageSize < active.length ? String(start + pageSize) : null, total: active.length };
    },
    async createConversation(input: { question: string }, operationId: string) {
      await requireEnabled();
      const replay = operations.get(operationId) as MutationResult<AssistantConversation> | undefined;
      if (replay) return replay;
      const id = `conversation-${conversations.size + 1}`;
      const response = await makeResponse(id, input.question, `${operationId}-initial`);
      responses.set(response.id, response);
      const conversation: AssistantConversation = {
        id,
        title: input.question.slice(0, 60) || 'Assistant conversation',
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
        lastResponseId: response?.id ?? null,
        version: 1
      };
      conversations.set(id, conversation);
      return remember(operationId, conversation, ['assistant.conversations', `assistant.conversation.${id}`, 'assistant.availability', 'assistant.context']);
    },
    async getConversation(id: string, cursor?: string) {
      const conversation = conversations.get(id);
      if (!conversation || conversation.status === 'deleted') throw new AssistantServiceError('not_found');
      const all = [...responses.values()].filter((item) => item.conversationId === id).sort((a, b) => b.createdAt - a.createdAt);
      const start = cursor ? Number(cursor) : 0;
      return { conversation, responses: { items: all.slice(start, start + 20), nextCursor: start + 20 < all.length ? String(start + 20) : null, total: all.length } };
    },
    async getResponse(id: string) {
      const response = responses.get(id);
      if (!response) throw new AssistantServiceError('not_found');
      return response;
    },
    async getActionPreview(id: string) {
      const preview = previews.get(id);
      if (!preview) throw new AssistantServiceError('not_found');
      return preview;
    },
    async updateActionPreview(id: string, input: AssistantActionInput, expectedVersion: number) {
      const preview = requirePreview(id, expectedVersion);
      const next = updateAssistantActionPreviewInput(preview, input, await currentSourceVersions());
      previews.set(id, next);
      return next;
    },
    async cancelAction(id: string, expectedVersion: number, operationId: string) {
      const replay = operations.get(operationId) as MutationResult<AssistantActionPreview> | undefined;
      if (replay) return replay;
      const preview = requirePreview(id, expectedVersion);
      const next = cancelAssistantActionPreview(preview);
      previews.set(id, next);
      return remember(operationId, next, [`assistant.actionPreview.${id}`]);
    },
    async confirmAction(id: string, expectedVersion: number, operationId: string) {
      const replay = operations.get(operationId) as MutationResult<AssistantActionPreview> | undefined;
      if (replay) return replay;
      if (offline) throw new AssistantServiceError('offline');
      if (!(await permissionProvider())) throw new AssistantServiceError('permission_required');
      if (!(await entitlementProvider())) throw new AssistantServiceError('limit_reached');
      const preview = requirePreview(id, expectedVersion);
      const current = revalidateAssistantActionPreview(preview, { now: now(), sourceVersions: await currentSourceVersions() });
      if (current.status !== 'ready') {
        previews.set(id, current);
        return remember(operationId, current, [`assistant.actionPreview.${id}`]);
      }
      try {
        const confirming = transitionPreview(current, 'confirming', { operationId });
        previews.set(id, confirming);
        if (!previewRequiresConfirmation(confirming.kind)) {
          const next = transitionPreview(confirming, 'succeeded', { resultReference: navigationResult(confirming) });
          previews.set(id, next);
          return remember(operationId, next, [`assistant.actionPreview.${id}`]);
        }
        const result = await owners.createGoal({
          title: 'Assistant savings goal',
          targetMinor: (confirming.input as { amountMinor: number }).amountMinor,
          currencyCode: (confirming.input as { currency: string }).currency,
          targetDate: '2026-12-31' as const
        }, operationId);
        const next = transitionPreview(confirming, 'succeeded', { resultReference: result.value.id });
        previews.set(id, next);
        return remember(operationId, next, [`assistant.actionPreview.${id}`, ...result.affectedScopes]);
      } catch (error) {
        const failed = failAssistantActionPreview(current, 'representative_failure');
        previews.set(id, failed);
        throw new AssistantServiceError('representative_failure');
      }
    },
    async ask(conversationId: string, question: string, operationId: string) {
      await requireEnabled();
      const replay = operations.get(operationId) as MutationResult<AssistantResponse> | undefined;
      if (replay) return replay;
      const conversation = conversations.get(conversationId);
      if (!conversation || conversation.status !== 'active') throw new AssistantServiceError('not_found');
      const response = await makeResponse(conversationId, question, operationId);
      responses.set(response.id, response);
      conversations.set(conversationId, { ...conversation, lastResponseId: response.id, updatedAt: now() });
      return remember(operationId, response, [`assistant.conversation.${conversationId}`, 'assistant.availability', 'assistant.context']);
    },
    async renameConversation(id: string, title: string, expectedVersion: number, operationId: string) {
      const replay = operations.get(operationId) as MutationResult<AssistantConversation> | undefined;
      if (replay) return replay;
      const conversation = conversations.get(id);
      if (!conversation || conversation.version !== expectedVersion) throw new AssistantServiceError('conflict');
      const next = { ...conversation, title, updatedAt: now(), version: conversation.version + 1 };
      conversations.set(id, next);
      return remember(operationId, next, ['assistant.conversations', `assistant.conversation.${id}`]);
    },
    async deleteConversation(id: string, expectedVersion: number, operationId: string) {
      const replay = operations.get(operationId) as MutationResult<{ id: string }> | undefined;
      if (replay) return replay;
      const conversation = conversations.get(id);
      if (!conversation || conversation.version !== expectedVersion) throw new AssistantServiceError('conflict');
      conversations.set(id, { ...conversation, status: 'deleted', updatedAt: now(), version: conversation.version + 1 });
      for (const [responseId, response] of responses) if (response.conversationId === id) responses.delete(responseId);
      return remember(operationId, { id }, ['assistant.conversations', `assistant.conversation.${id}`]);
    },
    async setResponseFeedback(responseId: string, feedback: AssistantResponseFeedback, operationId: string) {
      const replay = operations.get(operationId) as MutationResult<AssistantResponse> | undefined;
      if (replay) return replay;
      const response = responses.get(responseId);
      if (!response) throw new AssistantServiceError('not_found');
      const next = deepFreeze({ ...response, feedback });
      responses.set(responseId, next);
      return remember(operationId, next, [`assistant.conversation.${response.conversationId}`]);
    }
  };

  function remember<T>(operationId: string, value: T, affectedScopes: readonly string[]): MutationResult<T> {
    const result = deepFreeze({ value: deepFreeze(value), affectedScopes: [...affectedScopes] });
    operations.set(operationId, result as MutationResult<unknown>);
    return result;
  }

  function requirePreview(id: string, expectedVersion: number) {
    const preview = previews.get(id);
    if (!preview) throw new AssistantServiceError('not_found');
    if (preview.version !== expectedVersion) throw new AssistantServiceError('conflict');
    return preview;
  }

  function createGoalPreview(id: string, responseId: string, context: ContextValue) {
    const value = context.snapshot.values.find((item) => typeof item.minor === 'number' && item.currency);
    return createAssistantActionPreview({
      id,
      responseId,
      kind: 'create_goal',
      input: { amountMinor: value?.minor ?? 0, currency: value?.currency ?? 'SAR' },
      affectedDestination: { kind: 'goal', goalId: 'draft-goal' },
      sourceVersions: context.snapshot.sources.map(({ id, version }) => ({ id, version })),
      now: now(),
      expiresInMs: 10 * 60_000
    });
  }

  function createNavigationPreview(id: string, responseId: string, kind: 'show_subscriptions') {
    return createAssistantActionPreview({
      id,
      responseId,
      kind,
      input: {},
      affectedDestination: { kind: 'subscriptions' },
      sourceVersions: [],
      now: now(),
      expiresInMs: 0
    });
  }

  function navigationResult(preview: AssistantActionPreview) {
    if (preview.affectedDestination.kind === 'subscriptions') return 'subscriptions';
    if (preview.affectedDestination.kind === 'transactions') return 'transactions';
    if (preview.affectedDestination.kind === 'obligation') return preview.affectedDestination.obligationId;
    return preview.id;
  }

  function transitionPreview(preview: AssistantActionPreview, status: AssistantActionPreview['status'], patch: Partial<AssistantActionPreview>) {
    if (!canTransitionPreview(preview.status, status)) throw new AssistantServiceError('conflict');
    return assistantActionPreviewSchema.parse({ ...preview, ...patch, status, version: preview.version + 1 });
  }
}

function responseTypeFor(question: string): AssistantResponse['responseType'] {
  const value = question.toLocaleLowerCase('en');
  if (value.includes('compare')) return 'comparison';
  if (value.includes('why')) return 'explanation';
  if (value.includes('save')) return 'saving_suggestion';
  if (value.includes('plan')) return 'plan';
  if (value.includes('obligation')) return 'obligation_analysis';
  if (value.includes('investment')) return 'insufficient_data';
  if (value.includes('subscription')) return 'safe_redirect';
  return 'direct';
}

function initialConsent(): AssistantConsent {
  return {
    status: 'not_requested',
    disclosedDataCategories: ['transactions', 'planning', 'reports'],
    consentedAt: null,
    disabledAt: null,
    version: 1
  };
}

function responseLimitations(responseType: AssistantResponse['responseType']) {
  if (responseType === 'insufficient_data') return ['insufficient_data'];
  if (responseType === 'safe_redirect') return ['educational_redirect'];
  return [];
}

function responseBlocks(responseType: AssistantResponse['responseType'], values: ContextValue['snapshot']['values']): AssistantResponse['blocks'] {
  const label = responseType === 'saving_suggestion' || responseType === 'plan' ? 'suggestion' : 'fact';
  const first = values[0];
  const blocks: AssistantResponse['blocks'] = [
    { label: first?.status === 'estimated' ? 'estimate' : label, key: `assistant.answer.${responseType}`, values: first ? blockValues(first) : {} }
  ];
  const estimate = values.find((value) => value.status === 'estimated' && value !== first);
  if (estimate) blocks.push({ label: 'estimate', key: `assistant.answer.${responseType}.estimate`, values: blockValues(estimate) });
  return blocks;
}

function blockValues(value: ContextValue['snapshot']['values'][number]) {
  const values: Record<string, string | number | boolean> = { key: value.key };
  if (value.minor !== undefined) values.minor = value.minor;
  if (value.currency !== undefined) values.currency = value.currency;
  if (value.status !== undefined) values.status = value.status;
  return values;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const assistantService = createMockAssistantService({
  registerForReset: true
});
