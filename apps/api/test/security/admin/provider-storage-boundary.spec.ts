import { ClerkProviderUnavailableError } from '../../../src/identity/clerk-client.service';
import { ExportStorage } from '../../../src/security/export-storage';

describe('provider and storage exceptional boundaries', () => {
  it('maps malformed private-storage responses to a stable non-secret error', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ signedURL: 'http://unsafe.test/object' }) });
    const storage = new ExportStorage({
      getRequired: jest.fn((key: string) => key.includes('URL') ? 'https://storage.example.test' : 'secret-fixture'),
      get: jest.fn(() => 100),
    } as never, fetcher as never);
    await expect(storage.sign('exports/request/privacy.zip', 60)).rejects.toThrow('EXPORT_STORAGE_UNAVAILABLE');
  });

  it('keeps provider failure detail account-agnostic', () => {
    expect(new ClerkProviderUnavailableError().message).toBe('CLERK_PROVIDER_UNAVAILABLE');
  });
});
