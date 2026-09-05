import { createHash } from 'node:crypto';
import type { Response } from 'express';

import { ReferenceController } from '../../../src/reference/reference.controller';
import { safeError } from '../../../src/platform/http/safe-exception.filter';

describe('reference HTTP contract', () => {
  it('sets a canonical ETag and returns no body for a match', async () => {
    const payload = [{ code: 'SAR', name: 'Saudi Riyal', minorUnit: 2, version: 1 }];
    const service = { execute: jest.fn().mockResolvedValue(payload) };
    const controller = new ReferenceController(service as never);
    const etag = `"${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}"`;
    const setHeader = jest.fn(),
      status = jest.fn().mockReturnThis();
    const response = {
      setHeader,
      status,
    } as unknown as Response;
    const request = {
      clerkPrincipal: { userId: 'user_1', sessionId: 's', factorAgeSeconds: 0 },
      requestId: 'request-1',
    } as never;
    await expect(
      controller.execute({
        operation: 'listCurrencies',
        request,
        body: {},
        query: {},
        params: {},
        ifNoneMatch: etag,
        response,
      }),
    ).resolves.toBeUndefined();
    expect(setHeader).toHaveBeenCalledWith('ETag', etag);
    expect(status).toHaveBeenCalledWith(304);
  });

  it.each([
    [409, 'ACCOUNT_CURRENCY_LOCKED'],
    [409, 'LEDGER_NOT_AVAILABLE'],
    [404, 'FX_UNAVAILABLE'],
    [409, 'CATEGORY_CYCLE'],
    [409, 'CATEGORY_USAGE_CHANGED'],
    [400, 'IDEMPOTENCY_KEY_REQUIRED'],
  ])('keeps %s %s in the safe allowlist', (status, code) => {
    expect(safeError(status, 'request-1', [], code)).toMatchObject({
      code,
      requestId: 'request-1',
    });
  });
});
