import { TrackingSourcePreferences } from './tracking-source-preferences';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, next: string) => {
      value = next;
    }),
    removeItem: jest.fn(async () => {
      value = null;
    })
  };
}

it('persists SMS and notification sources independently', async () => {
  const preferences = new TrackingSourcePreferences(memoryStorage());

  await preferences.set('sms', true);
  await preferences.set('notification', true);
  await preferences.set('sms', false);

  await expect(preferences.load()).resolves.toEqual({
    smsEnabled: false,
    notificationEnabled: true
  });
});

it('falls back to both sources disabled for malformed storage', async () => {
  const preferences = new TrackingSourcePreferences(memoryStorage('{bad'));

  await expect(preferences.load()).resolves.toEqual({
    smsEnabled: false,
    notificationEnabled: false
  });
});
