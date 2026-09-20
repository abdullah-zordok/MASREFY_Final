import { AiPrivacyHandler } from '../../../src/ai/ai-privacy.handler';

describe('AI conversation retention', () => {
  it('lists expired conversations and deletes only the versioned conversation', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: '99000000-0000-4000-8000-000000000001',
            last_message_at: new Date('2025-01-01T00:00:00Z'),
            version: '3',
          },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);
    const pool = {
      withClient: (action: (client: { query: typeof query }) => unknown) => action({ query }),
    };
    const handler = new AiPrivacyHandler(pool as never, {} as never);

    const result = await handler.listRetentionCandidates(
      new Date('2026-01-01T00:00:00Z'),
      null,
      10,
    );
    expect(result.items[0]).toMatchObject({
      resourceId: '99000000-0000-4000-8000-000000000001',
      version: 3,
    });
    const candidate = result.items[0];
    if (!candidate) throw new Error('RETENTION_CANDIDATE_MISSING');
    await expect(handler.applyRetention(candidate, 'delete')).resolves.toMatchObject({
      deletedCount: 1,
    });
    expect(query).toHaveBeenCalledWith(
      'delete from public.assistant_conversations where id=$1::uuid and version=$2',
      ['99000000-0000-4000-8000-000000000001', 3],
    );
  });
});
