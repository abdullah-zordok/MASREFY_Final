import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Request, Response } from 'express';

import { ClerkWebhookController } from '../../../src/identity/clerk-webhook.controller';

describe('Clerk webhook security boundary', () => {
  const secretBytes = Buffer.alloc(32, 61);
  const signingSecret = ['whsec', secretBytes.toString('base64')].join('_');

  function signedHeaders(body: string, eventId: string, timestamp: number) {
    const signature = createHmac('sha256', secretBytes)
      .update(`${eventId}.${String(timestamp)}.${body}`)
      .digest('base64');
    return { eventId, timestamp: String(timestamp), signature: `v1,${signature}` };
  }

  function boundary() {
    const repository = { receiveClerkWebhook: jest.fn().mockResolvedValue('inserted') };
    const controller = new ClerkWebhookController(repository as never, {
      get: jest.fn().mockReturnValue(262_144),
      getRequired: jest.fn().mockReturnValue(signingSecret),
    } as never);
    return { controller, repository, response: { status: jest.fn() } as unknown as Response };
  }

  it('uses the official verifier without custom signature comparison or forwarded identity', () => {
    const source = readFileSync(resolve(
      __dirname, '../../../src/identity/clerk-webhook.controller.ts',
    ), 'utf8');
    expect(source).toContain("verifyWebhook } from '@clerk/backend/webhooks'");
    expect(source).not.toMatch(/createHmac|timingSafeEqual|x-forwarded-for|forwarded/i);
    expect(source).not.toMatch(/console\.|logger\./i);
  });

  it('applies a bounded global limit before trusting spoofable request metadata', async () => {
    const controller = new ClerkWebhookController({} as never, {
      get: jest.fn().mockReturnValue(262_144), getRequired: jest.fn(),
    } as never);
    const request = { body: Buffer.from('{}') } as Request;
    const response = { status: jest.fn() } as unknown as Response;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const error = await controller.receive(
        request, undefined, undefined, undefined, response,
      ).catch((reason: unknown) => reason);
      expect(error).toMatchObject({ status: 401, response: { code: 'WEBHOOK_SIGNATURE_INVALID' } });
    }
    const limited = await controller.receive(
      request, undefined, undefined, undefined, response,
    ).catch((reason: unknown) => reason);
    expect(limited).toMatchObject({ status: 429, response: { code: 'RATE_LIMITED' } });
  });

  it.each([
    ['invalid', 0, 'v1,invalid'],
    ['stale', -601, null],
    ['future', 601, null],
  ])('rejects a %s signed delivery before persistence', async (_case, offset, overrideSignature) => {
    const body = JSON.stringify({ type: 'user.updated', data: { id: 'security_fixture' } });
    const headers = signedHeaders(body, `msg_security_${_case}`, Math.floor(Date.now() / 1000) + offset);
    const { controller, repository, response } = boundary();
    await expect(controller.receive(
      { body: Buffer.from(body) } as Request,
      headers.eventId,
      headers.timestamp,
      overrideSignature ?? headers.signature,
      response,
    )).rejects.toMatchObject({ status: 401, response: { code: 'WEBHOOK_SIGNATURE_INVALID' } });
    expect(repository.receiveClerkWebhook).not.toHaveBeenCalled();
  });

  it('accepts an identical signed replay only through the durable duplicate path', async () => {
    const body = JSON.stringify({ type: 'user.created', data: { id: 'security_fixture' } });
    const headers = signedHeaders(body, 'msg_security_replay', Math.floor(Date.now() / 1000));
    const { controller, repository, response } = boundary();
    repository.receiveClerkWebhook.mockResolvedValueOnce('inserted').mockResolvedValueOnce('duplicate');
    for (let delivery = 0; delivery < 2; delivery += 1) {
      await expect(controller.receive(
        { body: Buffer.from(body) } as Request,
        headers.eventId,
        headers.timestamp,
        headers.signature,
        response,
      )).resolves.toEqual({ accepted: true });
    }
    expect(repository.receiveClerkWebhook).toHaveBeenCalledTimes(2);
  });

  it('keeps private payloads outside every client grant', () => {
    const migration = readFileSync(resolve(
      __dirname, '../../../../../supabase/migrations/20260827001200_clerk_webhook_grants.sql',
    ), 'utf8');
    expect(migration).toMatch(/grant select \(clerk_event_id, payload_hash\)[\s\S]+to masarifi_api/i);
    expect(migration).not.toMatch(/grant select[^;]*payload[^;]*to (?:authenticated|anon)/i);
    expect(migration).toContain('force row level security');
  });
});
