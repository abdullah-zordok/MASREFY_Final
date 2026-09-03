import { AiService } from '../../../src/ai/ai.service';

const owner = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
const id = '99000000-0000-4000-8000-000000000001';

describe('assistant SSE orchestration', () => {
  it('emits bounded meta/delta/preview/done events from persisted safe output', async () => {
    const repository = {
      messageResult: jest.fn(() =>
        Promise.resolve({
          status: 'completed',
          response: { id: '99000000-0000-4000-8000-000000000002', content: 'safe' },
          preview: { id: '99000000-0000-4000-8000-000000000003' },
        }),
      ),
      cancelMessage: jest.fn(),
    };
    const service = new AiService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const events = [];
    for await (const event of service.streamMessage(owner, id, new AbortController().signal))
      events.push(event);
    expect(events.map(({ event }) => event)).toEqual(['meta', 'delta', 'preview', 'done']);
    expect(JSON.stringify(events)).not.toMatch(/provider|model|prompt|token/i);
  });

  it('cancels queued work when the client disconnects', async () => {
    const repository = {
      messageResult: jest.fn(),
      cancelMessage: jest.fn(() => Promise.resolve(true)),
    };
    const service = new AiService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const controller = new AbortController();
    const stream = service.streamMessage(owner, id, controller.signal)[Symbol.asyncIterator]();
    await stream.next();
    controller.abort();
    await stream.next();
    expect(repository.cancelMessage).toHaveBeenCalledWith(owner, id);
  });
});
