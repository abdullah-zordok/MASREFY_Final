import { z } from 'zod';
import {
  HttpError,
  configureMobileApiTokenProvider,
  requestJson,
  sanitizeHttpLog
} from './http-client';

const schema = z.object({ state: z.enum(['ready']) }).strict();
const response = (status: number, value?: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(value)
  }) as unknown as Response;

describe('Mobile strict HTTP client', () => {
  beforeEach(() =>
    configureMobileApiTokenProvider(async () => 'clerk-session')
  );

  it('injects the Clerk bearer and preserves idempotency and version headers', async () => {
    const request = jest
      .fn()
      .mockResolvedValue(response(200, { state: 'ready' }));

    await expect(
      requestJson('/api/v1/me', schema, {
        baseUrl: 'https://api.example',
        request,
        method: 'PATCH',
        body: { locale: 'en' },
        headers: {
          Authorization: 'Bearer attacker',
          'Idempotency-Key': 'profile-1',
          'If-Match': '"7"'
        }
      })
    ).resolves.toEqual({ state: 'ready' });

    expect(request).toHaveBeenCalledWith(
      'https://api.example/api/v1/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-session',
          'Idempotency-Key': 'profile-1',
          'If-Match': '"7"'
        })
      })
    );
  });

  it('decodes flat safe errors and rejects unsupported codes without leaking messages', async () => {
    const known = jest.fn().mockResolvedValue(
      response(422, {
        code: 'VALIDATION_FAILED',
        message: 'secret provider detail'
      })
    );
    await expect(
      requestJson('/known', schema, {
        baseUrl: 'https://api.example',
        request: known
      })
    ).rejects.toMatchObject({ code: 'validation_error' });

    const unknown = jest
      .fn()
      .mockResolvedValue(
        response(500, { code: 'NEW_FATAL_STATE', message: 'secret token' })
      );
    const failure = await requestJson('/unknown', schema, {
      baseUrl: 'https://api.example',
      request: unknown
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpError);
    expect(failure).toMatchObject({ code: 'contract_mismatch' });
    expect((failure as Error).message).not.toContain('secret');
  });

  it('requires explicit values for 204 and 304 responses', async () => {
    await expect(
      requestJson('/empty', z.null(), {
        baseUrl: 'https://api.example',
        request: jest.fn().mockResolvedValue(response(204)),
        emptyValue: null
      })
    ).resolves.toBeNull();
    await expect(
      requestJson('/cached', schema, {
        baseUrl: 'https://api.example',
        request: jest.fn().mockResolvedValue(response(304)),
        notModifiedValue: { state: 'ready' }
      })
    ).resolves.toEqual({ state: 'ready' });
    await expect(
      requestJson('/missing-empty', z.null(), {
        baseUrl: 'https://api.example',
        request: jest.fn().mockResolvedValue(response(204))
      })
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  it('fails explicitly on malformed JSON and unknown response states', async () => {
    const malformed = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('bad json'))
    } as unknown as Response);
    await expect(
      requestJson('/malformed', schema, {
        baseUrl: 'https://api.example',
        request: malformed
      })
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
    await expect(
      requestJson('/state', schema, {
        baseUrl: 'https://api.example',
        request: jest.fn().mockResolvedValue(response(200, { state: 'future' }))
      })
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  it('fails safely on timeouts and caller aborts', async () => {
    const pending = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () =>
            reject(
              Object.assign(new Error('aborted token=secret'), {
                name: 'AbortError'
              })
            );
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort);
        })
    );
    await expect(
      requestJson('/slow', schema, {
        baseUrl: 'https://api.example',
        request: pending as typeof fetch,
        timeoutMs: 5
      })
    ).rejects.toMatchObject({ code: 'provider_unavailable' });

    const controller = new AbortController();
    controller.abort();
    await expect(
      requestJson('/aborted', schema, {
        baseUrl: 'https://api.example',
        request: pending as typeof fetch,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  it('redacts request paths, tokens, payloads, and errors from logs', () => {
    expect(
      sanitizeHttpLog({
        path: '/api/v1/me?email=person@example.test',
        authorization: 'Bearer secret',
        payload: { name: 'Person' },
        error: new Error('token secret'),
        status: 500
      })
    ).toEqual({
      path: '[REDACTED]',
      authorization: '[REDACTED]',
      payload: '[REDACTED]',
      error: '[REDACTED]',
      status: 500
    });
  });
});
