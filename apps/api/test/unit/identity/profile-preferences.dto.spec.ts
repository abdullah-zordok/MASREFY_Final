import { ValidationPipe } from '@nestjs/common';

import {
  assertIdempotencyKey,
  assertProfileUpdateFields,
  PreferencesReplaceDto,
  ProfileUpdateDto,
} from '../../../src/identity/identity.dto';

describe('profile and preferences DTOs', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });

  async function body<T extends object>(value: unknown, metatype: new () => T): Promise<T> {
    return (await pipe.transform(value, { type: 'body', metatype })) as T;
  }

  it('normalizes only the approved profile update fields', async () => {
    const dto = await body(
      { displayName: '  Masarifi User  ', locale: 'ar', timezone: 'Asia/Riyadh', expectedVersion: 2 },
      ProfileUpdateDto,
    );
    assertProfileUpdateFields(dto);
    expect(dto).toEqual({
      displayName: 'Masarifi User',
      locale: 'ar',
      timezone: 'Asia/Riyadh',
      expectedVersion: 2,
    });
  });

  it.each([
    { status: 'active', expectedVersion: 1 },
    { id: 'another-owner', locale: 'en', expectedVersion: 1 },
    { primaryEmail: 'private@example.test', locale: 'en', expectedVersion: 1 },
  ])('rejects profile mass assignment', async (value) => {
    await expect(body(value, ProfileUpdateDto)).rejects.toBeDefined();
  });

  it('requires one actual profile change and a valid IANA timezone', async () => {
    const empty = await body({ expectedVersion: 1 }, ProfileUpdateDto);
    expect(() => {
      assertProfileUpdateFields(empty);
    }).toThrow('PROFILE_UPDATE_EMPTY');
    await expect(body({ timezone: 'Riyadh', expectedVersion: 1 }, ProfileUpdateDto)).rejects.toBeDefined();
  });

  it('accepts one complete strict preference replacement', async () => {
    await expect(body({
      defaultCurrency: 'EGP',
      language: 'en',
      theme: 'dark',
      calendar: 'gregorian',
      weekStart: 0,
      privacySettings: { hideBalances: true, reducedMotion: false },
      expectedVersion: 1,
    }, PreferencesReplaceDto)).resolves.toMatchObject({ defaultCurrency: 'EGP', expectedVersion: 1 });
  });

  it.each([
    { defaultCurrency: 'egp' },
    { language: 'fr' },
    { theme: 'auto' },
    { calendar: 'iso' },
    { weekStart: 7 },
    { privacySettings: { unknown: true } },
    { privacySettings: { hideBalances: 'yes' } },
  ])('rejects invalid or incomplete preferences', async (override) => {
    await expect(body({
      defaultCurrency: 'SAR',
      language: 'ar',
      theme: 'system',
      calendar: 'gregorian',
      weekStart: 6,
      privacySettings: {},
      expectedVersion: 1,
      ...override,
    }, PreferencesReplaceDto)).rejects.toBeDefined();
  });

  it.each([undefined, '', 'short', 'contains space', 'x'.repeat(129)])(
    'rejects an invalid idempotency key',
    (key) => {
      expect(() => {
        assertIdempotencyKey(key);
      }).toThrow('IDEMPOTENCY_KEY_INVALID');
    },
  );

  it('accepts a bounded idempotency key', () => {
    expect(assertIdempotencyKey('profile-update_01')).toBe('profile-update_01');
  });
});
