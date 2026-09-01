import { HttpException } from '@nestjs/common';

import type { PlanningRepository } from '../../../src/planning/planning.repository';
import { PlanningService } from '../../../src/planning/planning.service';

const principal = { userId: 'salary_owner', sessionId: 'session', factorAgeSeconds: 0 };
const profileId = '70000000-0000-4000-8000-000000000011';
const receiptId = '70000000-0000-4000-8000-000000000012';
const transactionId = '70000000-0000-4000-8000-000000000013';

describe('salary planning service', () => {
  const mutate = jest.fn<
    ReturnType<PlanningRepository['mutate']>,
    Parameters<PlanningRepository['mutate']>
  >();
  const listSalaryProfiles = jest.fn();
  const getSalaryProfile = jest.fn();
  const listSalaryReceipts = jest.fn();
  const service = new PlanningService({
    mutate,
    listSalaryProfiles,
    getSalaryProfile,
    listSalaryReceipts,
  } as never);

  beforeEach(() => mutate.mockResolvedValue({ operationId: profileId, replayed: false }));

  it('normalizes one salary profile command with canonical string money', async () => {
    await service.createSalaryProfile({
      principal,
      idempotencyKey: 'salary-create-key-0001',
      requestId: 'request-1',
      body: {
        name: '  Main salary  ',
        amountMinor: '9007199254740993',
        currencyCode: 'SAR',
        frequency: 'monthly',
        expectedDay: 31,
        accountId: null,
        automaticDetectionEnabled: true,
      },
    });
    const input = mutate.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      operation: 'createSalaryProfile',
      scope: 'planning.salary-profile.create',
      principal,
      status: 201,
    });
    expect(input?.command).toMatchObject({
      name: 'Main salary',
      amountMinor: '9007199254740993',
      currencyCode: 'SAR',
      frequency: 'monthly',
      expectedDay: 31,
      customIntervalDays: null,
    });
  });

  it('keeps profile update, receipt link, and unlink commands route-specific', async () => {
    await service.updateSalaryProfile(profileId, {
      principal,
      idempotencyKey: 'salary-update-key-0001',
      requestId: 'request-2',
      body: { expectedVersion: 2, patch: { status: 'paused', amountMinor: '5000' } },
    });
    await service.linkSalaryReceipt(profileId, {
      principal,
      idempotencyKey: 'salary-link-key-00001',
      requestId: 'request-3',
      body: { transactionId, expectedAt: '2026-09-30T00:00:00.000Z', replacesReceiptId: null },
    });
    await service.unlinkSalaryReceipt(profileId, receiptId, {
      principal,
      idempotencyKey: 'salary-unlink-key-001',
      requestId: 'request-4',
      body: { expectedVersion: 1 },
    });
    expect(mutate.mock.calls.map(([input]) => input.operation)).toEqual([
      'updateSalaryProfile',
      'linkSalaryReceipt',
      'unlinkSalaryReceipt',
    ]);
    expect(mutate.mock.calls[0]?.[0].command).toEqual({
      profileId,
      expectedVersion: 2,
      patch: { status: 'paused', amountMinor: '5000' },
    });
  });

  it('passes bounded owner reads and preserves durable replay responses', async () => {
    listSalaryProfiles.mockResolvedValue({ items: [], nextCursor: null });
    getSalaryProfile.mockResolvedValue({ id: profileId, amountMinor: '5000' });
    listSalaryReceipts.mockResolvedValue({ items: [], nextCursor: null });
    mutate.mockResolvedValueOnce({ operationId: profileId, replayed: true });
    await expect(
      service.createSalaryProfile({
        principal,
        idempotencyKey: 'salary-replay-key-001',
        requestId: 'request-5',
        body: {
          name: 'Salary',
          amountMinor: '5000',
          currencyCode: 'SAR',
          frequency: 'monthly',
          expectedDay: 1,
        },
      }),
    ).resolves.toMatchObject({ replayed: true });
    await expect(service.listSalaryProfiles(principal, {}, 'request-6')).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      service.getSalaryProfile(principal, profileId, 'request-7'),
    ).resolves.toMatchObject({
      amountMinor: '5000',
    });
    await expect(
      service.listSalaryReceipts(principal, profileId, {}, 'request-8'),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it.each([
    { name: 'Salary', amountMinor: '0', currencyCode: 'SAR', frequency: 'monthly', expectedDay: 1 },
    { name: 'Salary', amountMinor: '1', currencyCode: 'sar', frequency: 'monthly', expectedDay: 1 },
    {
      name: 'Salary',
      amountMinor: '1',
      currencyCode: 'SAR',
      frequency: 'monthly',
      expectedDay: null,
    },
    {
      name: 'Salary',
      amountMinor: '1',
      currencyCode: 'SAR',
      frequency: 'custom',
      customIntervalDays: 0,
    },
    {
      name: 'Salary',
      amountMinor: '1',
      currencyCode: 'SAR',
      frequency: 'monthly',
      expectedDay: 1,
      userId: 'other',
    },
  ])('rejects invalid or mass-assigned profile input %#', (body) => {
    expect(() =>
      service.createSalaryProfile({
        principal,
        idempotencyKey: 'salary-invalid-key-1',
        requestId: 'bad',
        body,
      }),
    ).toThrow(HttpException);
  });

  it('preserves safe stale and not-found repository errors', async () => {
    mutate.mockRejectedValueOnce(
      new HttpException({ code: 'VERSION_CONFLICT', currentVersion: 4 }, 409),
    );
    await expect(
      service.updateSalaryProfile(profileId, {
        principal,
        idempotencyKey: 'salary-stale-key-001',
        requestId: 'request-9',
        body: { expectedVersion: 2, patch: { status: 'paused' } },
      }),
    ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT', currentVersion: 4 } });
  });
});
