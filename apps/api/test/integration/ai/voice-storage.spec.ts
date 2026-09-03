import { AiStorage } from '../../../src/ai/ai.storage';

const key = 'voice/99000000-0000-4000-8000-000000000001/99000000-0000-4000-8000-000000000002';
const config = {
  getRequired: (name: string) =>
    name === 'SUPABASE_URL' ? 'https://storage.example.test' : 'service-role-fixture',
};

describe('private voice object boundary', () => {
  it('signs, streams an exact-size object, and permits idempotent purge without exposing the credential', async () => {
    const audio = Buffer.alloc(44);
    audio.write('RIFF');
    audio.write('WAVE', 8);
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: `/signed/${key}`, token: 'signed-token-fixture' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(audio, { status: 200, headers: { 'content-length': '44' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const storage = new AiStorage(config as never, fetcher);
    await expect(storage.signedUpload(key, 300, 'audio/wav')).resolves.toMatchObject({
      url: `https://storage.example.test/signed/${key}`,
      token: 'signed-token-fixture',
      headers: { 'content-type': 'audio/wav' },
    });
    await expect(storage.download(key, 44)).resolves.toEqual(audio);
    await expect(storage.delete(key)).resolves.toBeUndefined();
    const calls = fetcher.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    expect(
      calls.every(
        ([, init]) =>
          new Headers(init?.headers).get('authorization') === 'Bearer service-role-fixture',
      ),
    ).toBe(true);
  });

  it('rejects cross-origin signatures, caller-selected keys, and oversized streams', async () => {
    const crossOrigin = new AiStorage(
      config as never,
      jest.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ url: 'https://evil.test/upload', token: 'signed-token-fixture' }),
          ),
        ),
      ),
    );
    await expect(crossOrigin.signedUpload(key, 300, 'audio/wav')).rejects.toThrow(
      'VOICE_STORAGE_UNAVAILABLE',
    );
    await expect(new AiStorage(config as never, jest.fn()).delete('../secret')).rejects.toThrow(
      'VOICE_STORAGE_INVALID',
    );
    const storage = new AiStorage(
      config as never,
      jest.fn(() => Promise.resolve(new Response(Buffer.alloc(45)))),
    );
    await expect(storage.download(key, 44)).rejects.toThrow('VOICE_MEDIA_INVALID');
  });
});
