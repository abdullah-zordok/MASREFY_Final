import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import {
  ClerkClientService,
  ClerkProviderUnavailableError,
} from '../../../src/identity/clerk-client.service';

const revokeSession = jest.fn();
const getUser = jest.fn();
const getUserList = jest.fn();

jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    sessions: { revokeSession },
    users: { getUser, getUserList },
  }),
}));

const config = {
  get: (key: string) => ({
    MASARIFI_CLERK_API_TIMEOUT_MS: 500,
    CLERK_PUBLISHABLE_KEY: ['pk', 'test', 'clientfixture'].join('_'),
    CLERK_INSTANCE_DOMAIN: 'example.clerk.accounts.dev',
    CLERK_AUTHORIZED_PARTIES: ['https://admin.example.test'],
  })[key],
  getRequired: () => ['sk', 'test', 'clientfixture'].join('_'),
} as unknown as PlatformConfigService;

describe('Clerk Admin client adapter', () => {
  let service: ClerkClientService;

  beforeEach(() => {
    service = new ClerkClientService(config);
  });

  it('maps revoke success and provider not-found to repeatable outcomes', async () => {
    revokeSession.mockResolvedValueOnce({}).mockRejectedValueOnce({ status: 404 });
    await expect(service.revokeSession('session_fixture_a')).resolves.toBe('revoked');
    await expect(service.revokeSession('session_fixture_a')).resolves.toBe('not_found');
  });

  it('returns only normalized current identity fields', async () => {
    getUser.mockResolvedValue({
      id: 'user_fixture_a',
      primaryEmailAddressId: 'email_a',
      primaryPhoneNumberId: 'phone_a',
      emailAddresses: [{ id: 'email_a', emailAddress: ' OWNER@EXAMPLE.TEST ' }],
      phoneNumbers: [{ id: 'phone_a', phoneNumber: '+966500000012' }],
      firstName: ' First ', lastName: ' Last ',
    });
    await expect(service.getIdentityUser('user_fixture_a')).resolves.toEqual({
      id: 'user_fixture_a', primaryEmail: 'owner@example.test',
      primaryPhone: '+966500000012', displayName: 'First Last',
    });
  });

  it('distinguishes confirmed absence from provider failure', async () => {
    getUser.mockRejectedValueOnce({ status: 404 }).mockRejectedValueOnce(new Error('private provider detail'));
    await expect(service.getIdentityUser('user_fixture_a')).resolves.toBeNull();
    await expect(service.getIdentityUser('user_fixture_a')).rejects.toBeInstanceOf(ClerkProviderUnavailableError);
  });

  it('returns a bounded resumable provider page', async () => {
    getUserList.mockResolvedValue({
      data: [{
        id: 'user_fixture_a', primaryEmailAddressId: null, primaryPhoneNumberId: null,
        emailAddresses: [], phoneNumbers: [], firstName: null, lastName: null,
      }],
      totalCount: 3,
    });
    await expect(service.listIdentityUsers(0, 1)).resolves.toEqual({
      users: [{ id: 'user_fixture_a', primaryEmail: null, primaryPhone: null, displayName: null }],
      nextOffset: 1,
    });
    expect(getUserList).toHaveBeenCalledWith({ offset: 0, limit: 1, orderBy: '+created_at' });
  });
});
