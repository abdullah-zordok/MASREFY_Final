import { HttpException } from '@nestjs/common';

import { buildProfileUpdatedPayload } from '../../../src/identity/identity.events';
import { IdentityService, maskEmail, maskPhone } from '../../../src/identity/identity.service';

describe('profile data exposure boundaries', () => {
  const principal = { userId: 'user_fixture_a', sessionId: 'session_fixture_a', factorAgeSeconds: 30 };

  it('masks contact fields without returning the originals', () => {
    expect(maskEmail('owner@example.test')).toBe('o***@example.test');
    expect(maskPhone('+966500000012')).toBe('+***12');
  });

  it('returns only the approved masked projection', async () => {
    const repository = {
      getProfile: jest.fn().mockResolvedValue({
        id: principal.userId,
        primaryEmail: 'owner@example.test',
        phoneE164: '+966500000012',
        displayName: 'Owner',
        locale: 'ar',
        timezone: 'Asia/Riyadh',
        status: 'active',
        version: 1,
      }),
    };
    const response = await new IdentityService(repository as never).getProfile(principal);
    expect(response.primaryEmailMasked).toBe('o***@example.test');
    expect(response.phoneMasked).toBe('+***12');
    expect(JSON.stringify(response)).not.toContain('owner@example.test');
    expect(JSON.stringify(response)).not.toContain('+966500000012');
  });

  it('maps provider/database failures to one safe code', async () => {
    const repository = {
      getProfile: jest.fn().mockRejectedValue(new Error('connection failed with credential and contact')),
    };
    const promise = new IdentityService(repository as never).getProfile(principal);
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ response: { code: 'PROFILE_SYNC_UNAVAILABLE' } });
  });

  it('never puts contact values in profile event payloads', () => {
    const payload = buildProfileUpdatedPayload(principal.userId, 2, ['primary_email', 'phone_e164']);
    expect(payload).toEqual(expect.objectContaining({ changedFields: ['phone_e164', 'primary_email'] }));
    expect(JSON.stringify(payload)).not.toContain('@');
    expect(JSON.stringify(payload)).not.toContain('+966');
  });
});
