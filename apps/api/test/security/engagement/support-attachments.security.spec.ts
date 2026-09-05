import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpException } from '@nestjs/common';

import type { ClerkPrincipal } from '../../../src/identity/clerk-auth.guard';
import { EngagementService } from '../../../src/engagement/engagement.service';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';
import type { SecurityRepository } from '../../../src/security/security.repository';

const principal = {
  userId: 'phase11-support-owner',
  sessionId: 'session-1',
  factorAgeSeconds: 10,
} as ClerkPrincipal;

const finalize = {
  operation: 'finalizeSupportAttachment',
  params: { ticketId: '10000000-0000-4000-8000-000000000001' },
  body: {
    uploadId: '20000000-0000-4000-8000-000000000001',
    filename: 'evidence.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    sha256: 'a'.repeat(64),
    expectedVersion: 1,
  },
  requestId: 'request-1',
  idempotencyKey: 'attachment-finalize-key',
};

test('attachment initialization rejects executable MIME, path separators, oversized files, and bad digests', () => {
  const base = {
    operation: 'initializeSupportAttachment',
    params: { ticketId: '10000000-0000-4000-8000-000000000001' },
    requestId: 'request-1',
    idempotencyKey: 'attachment-upload-key',
  };
  const safe = {
    filename: 'evidence.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    sha256: 'a'.repeat(64),
  };
  expect(() => validateEngagementCommand({ ...base, body: safe })).not.toThrow();
  for (const body of [
    { ...safe, filename: '../evidence.pdf' },
    { ...safe, contentType: 'text/html' },
    { ...safe, sizeBytes: 10_485_761 },
    { ...safe, sha256: 'bad' },
  ])
    expect(() => validateEngagementCommand({ ...base, body })).toThrow('ENGAGEMENT_INPUT_INVALID');
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../../supabase/migrations/20260905070618_phase11_functions_access.sql',
    ),
    'utf8',
  );
  expect(migration).toMatch(
    /user_id=\(select public\.current_clerk_user_id\(\)\) and scan_status='clean'/,
  );
});

test('attachment finalization authorizes ownership before privileged storage access', async () => {
  const repository = {
    execute: jest.fn().mockRejectedValue(new HttpException({ code: 'NOT_FOUND' }, 404)),
  };
  const storage = { verify: jest.fn() };
  const security = { consumeRateLimit: jest.fn().mockResolvedValue(true) };
  const service = new EngagementService(
    repository as unknown as EngagementRepository,
    storage as unknown as SupportStorage,
    security as unknown as SecurityRepository,
  );

  await expect(service.execute(principal, finalize)).rejects.toMatchObject({ status: 404 });
  expect(repository.execute).toHaveBeenCalledWith(
    principal,
    expect.objectContaining({ operation: 'getSupportTicket', params: finalize.params }),
  );
  expect(storage.verify).not.toHaveBeenCalled();
});

test('owned attachment finalization preserves verification and mutation', async () => {
  const repository = {
    execute: jest
      .fn()
      .mockResolvedValueOnce({ id: finalize.params.ticketId })
      .mockResolvedValueOnce({ resourceId: finalize.body.uploadId }),
  };
  const storage = { verify: jest.fn().mockResolvedValue(undefined) };
  const security = { consumeRateLimit: jest.fn().mockResolvedValue(true) };
  const service = new EngagementService(
    repository as unknown as EngagementRepository,
    storage as unknown as SupportStorage,
    security as unknown as SecurityRepository,
  );

  await expect(service.execute(principal, finalize)).resolves.toMatchObject({
    resourceId: finalize.body.uploadId,
  });
  expect(storage.verify).toHaveBeenCalledWith(
    `support/${finalize.params.ticketId}/${finalize.body.uploadId}`,
    finalize.body.sizeBytes,
    finalize.body.contentType,
    finalize.body.sha256,
  );
  expect(repository.execute).toHaveBeenLastCalledWith(
    principal,
    expect.objectContaining({ operation: 'finalizeSupportAttachment' }),
  );
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../../supabase/migrations/20260905070618_phase11_functions_access.sql',
    ),
    'utf8',
  );
  expect(migration).toMatch(
    /finalizeSupportAttachment[\s\S]*exists\(select 1 from public\.support_tickets t where t\.id=p_resource_id and t\.user_id=p_actor\)/,
  );
});
