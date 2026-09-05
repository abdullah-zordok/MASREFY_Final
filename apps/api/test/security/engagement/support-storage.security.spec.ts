import { SupportStorage } from '../../../src/engagement/support.storage';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';

const key = 'support/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002';
const sha256 = 'a'.repeat(64);

function config(): PlatformConfigService {
  return {
    getRequired: jest.fn((name: string) => {
      if (name === 'SUPABASE_URL') return 'https://storage.example.test';
      if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'server-only-secret';
      if (name === 'MASARIFI_SUPPORT_SIGNED_URL_SECONDS') return 120;
      throw new Error(`unexpected ${name}`);
    }),
  } as unknown as PlatformConfigService;
}

describe('support storage boundary', () => {
  it('binds signed upload instructions to the declared MIME type and digest', async () => {
    let request: RequestInit | undefined;
    const fetcher = jest.fn((_url: URL | RequestInfo, input?: RequestInit): Promise<Response> => {
      request = input;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            url: `/storage/v1/object/upload/sign/support-attachments/${key}?token=x`,
          }),
          {
            status: 200,
          },
        ),
      );
    });
    const storage = new SupportStorage(config(), fetcher as typeof fetch);

    const signed = await storage.signUpload(key, 'application/pdf', sha256);

    expect(signed.headers).toEqual({
      'content-type': 'application/pdf',
      'x-content-sha256': sha256,
    });
    expect(new URL(signed.url).origin).toBe('https://storage.example.test');
    expect((request?.headers as Headers).get('Authorization')).toBe('Bearer server-only-secret');
  });

  it('rejects traversal, unsupported content, bad digests, and foreign signed origins', async () => {
    const foreign = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ url: 'https://attacker.test/object' }), { status: 200 }),
      );
    const storage = new SupportStorage(config(), foreign);

    await expect(storage.signUpload('../secret', 'application/pdf', sha256)).rejects.toThrow(
      'SUPPORT_STORAGE_INVALID',
    );
    await expect(storage.signUpload(key, 'text/html', sha256)).rejects.toThrow(
      'SUPPORT_STORAGE_INVALID',
    );
    await expect(storage.signUpload(key, 'application/pdf', 'bad')).rejects.toThrow(
      'SUPPORT_STORAGE_INVALID',
    );
    await expect(storage.signUpload(key, 'application/pdf', sha256)).rejects.toThrow(
      'SUPPORT_STORAGE_UNAVAILABLE',
    );
  });
});
