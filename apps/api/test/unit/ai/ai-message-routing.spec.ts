import { AiService } from '../../../src/ai/ai.service';
import type { FinancialToolResult } from '../../../src/ai/ai-financial-tools';
import type { AssistantIntent, AssistantTurn } from '../../../src/ai/ai-routing';

const owner = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
const conversationId = '99000000-0000-4000-8000-000000000001';
const accepted = {
  resource: { id: '99000000-0000-4000-8000-000000000002', workStatus: 'completed' },
};

describe('AiService provider-boundary routing', () => {
  const repository = {
    workloadAvailable: jest.fn(() => Promise.resolve(true)),
    recentConversationTurns: jest.fn<Promise<AssistantTurn[]>, []>(() => Promise.resolve([])),
    saveDeterministicMessage: jest.fn(() => Promise.resolve(accepted)),
    enqueueMessage: jest.fn(() =>
      Promise.resolve({
        resource: { ...accepted.resource, workStatus: 'queued' },
      }),
    ),
  };
  const tools = {
    resolve: jest.fn<Promise<FinancialToolResult>, [typeof owner, AssistantIntent, string, string]>(
      () =>
        Promise.resolve({
          answer: 'صرفت 2,350 ريال هذا الشهر.',
          context: { monthlySpendingMinor: 235_000, currency: 'SAR' },
          evidence: [{ kind: 'ledger', version: 12 }],
        }),
    ),
  };
  const service = new AiService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    tools as never,
    { getRequired: jest.fn(() => true) } as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it.each(['اكتبلي كود React', 'مين كسب ماتش الهلال؟', 'اكتب قصة'])(
    'persists an unrelated redirect without quota, provider, or personal finance reads: %s',
    async (content) => {
      await expect(
        service.createMessage(
          owner,
          conversationId,
          { content, responseMode: 'async' },
          'message-operation-key-0001',
        ),
      ).resolves.toMatchObject({ status: 'completed' });

      expect(repository.workloadAvailable).not.toHaveBeenCalled();
      expect(repository.enqueueMessage).not.toHaveBeenCalled();
      expect(tools.resolve).not.toHaveBeenCalled();
      expect(repository.saveDeterministicMessage).toHaveBeenCalledWith(
        owner,
        conversationId,
        expect.objectContaining({ intent: 'unrelated', evidence: [] }),
        'message-operation-key-0001',
      );
    },
  );

  it('uses authoritative backend truth for a deterministic intent without reserving AI quota', async () => {
    await service.createMessage(
      owner,
      conversationId,
      { content: 'صرفي كام الشهر ده؟', intent: 'spending_summary', responseMode: 'async' },
      'message-operation-key-0002',
    );

    expect(tools.resolve).toHaveBeenCalledWith(
      owner,
      'spending_summary',
      'صرفي كام الشهر ده؟',
      expect.any(String),
    );
    expect(repository.workloadAvailable).not.toHaveBeenCalled();
    expect(repository.enqueueMessage).not.toHaveBeenCalled();
    expect(repository.saveDeterministicMessage).toHaveBeenCalledWith(
      owner,
      conversationId,
      expect.objectContaining({
        answer: 'صرفت 2,350 ريال هذا الشهر.',
        context: { monthlySpendingMinor: 235_000, currency: 'SAR' },
      }),
      'message-operation-key-0002',
    );
  });

  it('reserves quota only after routing a provider-bound request with minimal context', async () => {
    tools.resolve.mockResolvedValueOnce({
      answer: null,
      context: { current: { expenseMinor: 235_000 }, previous: { expenseMinor: 200_000 } },
      evidence: [{ kind: 'ledger', version: 12 }],
    });
    repository.recentConversationTurns.mockResolvedValueOnce([
      { role: 'user', content: 'صرفي كام الشهر ده؟', intent: 'spending_summary' },
    ]);

    await service.createMessage(
      owner,
      conversationId,
      { content: 'ليه صرفي زاد عن الشهر الماضي؟', responseMode: 'async' },
      'message-operation-key-0003',
    );

    expect(repository.workloadAvailable).toHaveBeenCalledWith('financial_assistant');
    expect(repository.enqueueMessage).toHaveBeenCalledWith(
      owner,
      conversationId,
      expect.objectContaining({
        intent: 'period_comparison',
        context: {
          current: { expenseMinor: 235_000 },
          previous: { expenseMinor: 200_000 },
        },
        history: [{ role: 'user', content: 'صرفي كام الشهر ده؟' }],
      }),
      'message-operation-key-0003',
    );
  });

  it('sends no personal context for a general finance explanation', async () => {
    tools.resolve.mockResolvedValueOnce({ answer: null, context: {}, evidence: [] });
    await service.createMessage(
      owner,
      conversationId,
      { content: 'يعني إيه تضخم؟', responseMode: 'async' },
      'message-operation-key-0004',
    );

    expect(repository.enqueueMessage).toHaveBeenCalledWith(
      owner,
      conversationId,
      expect.objectContaining({ intent: 'general_finance', context: {}, evidence: [] }),
      'message-operation-key-0004',
    );
  });
});
