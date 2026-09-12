import { createSmsInboxService } from './sms-inbox-service';
import { createAndroidSmsInboxService } from './sms-inbox-service.android';

describe('SMS inbox platform service', () => {
  it('is explicitly unavailable outside Android', async () => {
    const service = createSmsInboxService();

    expect(service.available).toBe(false);
    await expect(service.readRecent({ since: 1, limit: 100 })).resolves.toEqual([]);
    await expect(service.isNetworkAvailable()).resolves.toBe(false);
  });

  it('forwards bounded reads and validates native rows', async () => {
    const native = {
      readRecentSms: jest.fn().mockResolvedValue([
        {
          id: '42',
          sender: 'BANK',
          body: 'fixture body',
          receivedAt: 1_757_678_401_000
        }
      ]),
      isNetworkAvailable: jest.fn().mockResolvedValue(true)
    };
    const service = createAndroidSmsInboxService(native);

    await expect(
      service.readRecent({ since: 1_757_678_400_000, limit: 100 })
    ).resolves.toEqual([
      {
        id: '42',
        sender: 'BANK',
        body: 'fixture body',
        receivedAt: 1_757_678_401_000
      }
    ]);
    expect(native.readRecentSms).toHaveBeenCalledWith(
      1_757_678_400_000,
      100
    );
    await expect(service.isNetworkAvailable()).resolves.toBe(true);
  });

  it.each([
    [{ id: '', sender: 'BANK', body: 'body', receivedAt: 1 }],
    [{ id: '1', sender: null, body: 'body', receivedAt: 1 }],
    [{ id: '1', sender: 'BANK', body: 42, receivedAt: 1 }],
    [{ id: '1', sender: 'BANK', body: 'body', receivedAt: -1 }]
  ])('rejects invalid native rows %#', async (rows) => {
    const service = createAndroidSmsInboxService({
      readRecentSms: jest.fn().mockResolvedValue(rows),
      isNetworkAvailable: jest.fn().mockResolvedValue(false)
    });

    await expect(service.readRecent({ since: 0, limit: 10 })).rejects.toThrow(
      'sms_inbox_invalid_response'
    );
  });

  it('rejects invalid read bounds before calling native code', async () => {
    const native = {
      readRecentSms: jest.fn(),
      isNetworkAvailable: jest.fn()
    };
    const service = createAndroidSmsInboxService(native);

    await expect(service.readRecent({ since: -1, limit: 101 })).rejects.toThrow(
      'sms_inbox_invalid_request'
    );
    expect(native.readRecentSms).not.toHaveBeenCalled();
  });
});
