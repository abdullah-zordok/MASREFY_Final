import { createPreSignupReminderService } from './pre-signup-reminder-service';

const START = Date.parse('2026-09-14T12:00:00.000Z');

function setup(locale: 'ar' | 'en' = 'en') {
  let currentTime = START;
  const values = new Map<string, string>();
  const storage = {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void values.set(key, value)),
  };
  const phone = {
    scheduleLocal: jest
      .fn()
      .mockResolvedValueOnce({ status: 'scheduled', identifier: 'reminder-1' })
      .mockResolvedValueOnce({ status: 'scheduled', identifier: 'reminder-2' }),
    cancelScheduled: jest.fn().mockResolvedValue(undefined),
  };
  return {
    phone,
    service: createPreSignupReminderService({
      phone,
      storage,
      now: () => currentTime,
      locale: () => locale,
    }),
    setNow: (value: number) => { currentTime = value; },
  };
}

describe('pre-signup reminder service', () => {
  it('schedules exactly the 24h and 72h reminders once', async () => {
    const { phone, service } = setup();

    await expect(service.prepare()).resolves.toEqual({ shouldRequestPermission: true });
    await service.scheduleAfterPermission('granted');
    await service.scheduleAfterPermission('granted');

    expect(phone.scheduleLocal).toHaveBeenCalledTimes(2);
    expect(phone.scheduleLocal.mock.calls.map(([input]) => input.scheduledAt.toISOString())).toEqual([
      '2026-09-15T12:00:00.000Z',
      '2026-09-17T12:00:00.000Z',
    ]);
    expect(phone.scheduleLocal.mock.calls.map(([input]) => input.title)).toEqual([
      'Finish setting up Masarifi 👋',
      'Masarifi is ready for you',
    ]);
  });

  it('uses the approved Arabic reminder copy', async () => {
    const { phone, service } = setup('ar');

    await service.prepare();
    await service.scheduleAfterPermission('granted');

    expect(phone.scheduleLocal.mock.calls.map(([input]) => [input.title, input.body])).toEqual([
      ['كمّل إعداد مصاريفي 👋', 'سجّل حسابك وخلي مصاريفك تتسجل وتترتب تلقائيًا.'],
      ['مصاريفي جاهز لك', 'كمّل تسجيلك وابدأ تتابع صرفك بشكل أسهل.'],
    ]);
  });

  it('does not retry permission after denial', async () => {
    const { service } = setup();

    await service.prepare();
    await service.scheduleAfterPermission('denied');

    await expect(service.prepare()).resolves.toEqual({ shouldRequestPermission: false });
  });

  it('cancels pending reminders and never recreates them after authentication', async () => {
    const { phone, service } = setup();

    await service.prepare();
    await service.scheduleAfterPermission('granted');
    await service.completeAuthentication();

    expect(phone.cancelScheduled).toHaveBeenCalledTimes(2);
    await expect(service.prepare()).resolves.toEqual({ shouldRequestPermission: false });
  });

  it('does not schedule reminder targets that elapsed before permission was granted', async () => {
    const { phone, service, setNow } = setup();
    await service.prepare();
    setNow(START + 48 * 60 * 60 * 1_000);

    await service.scheduleAfterPermission('granted');

    expect(phone.scheduleLocal).toHaveBeenCalledTimes(1);
    expect(phone.scheduleLocal).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: new Date('2026-09-17T12:00:00.000Z') }),
    );
  });

  it('records restored authentication even when onboarding never created state', async () => {
    const { service } = setup();

    await service.completeAuthentication();

    await expect(service.prepare()).resolves.toEqual({ shouldRequestPermission: false });
  });
});
