import { createHash } from 'node:crypto';

import { verifyWebhook } from '@clerk/backend/webhooks';
import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { SafeErrorDto } from '../platform/http/platform-contract.dto';
import { IDENTITY_METRICS, recordPlatformMetric } from '../platform/observability/platform-metrics';
import { IdentityRepository } from './identity.repository';

const supportedTypes = new Set(['user.created', 'user.updated', 'user.deleted']);
type SupportedType = 'user.created' | 'user.updated' | 'user.deleted';

function domainError(code: string, status: number): HttpException {
  return new HttpException({ code }, status);
}

function bounded(value: string | undefined, max: number): value is string {
  return value !== undefined && value.trim() === value && value.length >= 1 && value.length <= max;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@ApiTags('Clerk Webhooks')
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private windowStartedAt = Date.now();
  private windowCount = 0;

  constructor(
    private readonly repository: IdentityRepository,
    private readonly config: PlatformConfigService,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: 'receiveClerkWebhook' })
  @ApiHeader({ name: 'svix-id', required: true })
  @ApiHeader({ name: 'svix-timestamp', required: true })
  @ApiHeader({ name: 'svix-signature', required: true })
  @ApiResponse({ status: 202, schema: { type: 'object', required: ['accepted'], properties: { accepted: { type: 'boolean', enum: [true] } } } })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, type: SafeErrorDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 409, type: SafeErrorDto })
  @ApiResponse({ status: 413, type: SafeErrorDto })
  @ApiResponse({ status: 429, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  async receive(
    @Req() request: ExpressRequest,
    @Headers('svix-id') eventId: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accepted: true } | undefined> {
    this.consumeRateLimit();
    if (!Buffer.isBuffer(request.body)) throw domainError('INVALID_WEBHOOK', 400);
    if (!bounded(eventId, 128) || !bounded(timestamp, 32) || !bounded(signature, 2048)) {
      throw domainError('WEBHOOK_SIGNATURE_INVALID', 401);
    }
    const raw = request.body;
    if (raw.length < 2 || raw.length > this.config.get('MASARIFI_HTTP_BODY_LIMIT_BYTES')) {
      throw domainError('INVALID_WEBHOOK', 400);
    }
    const headers = new globalThis.Headers({
      'content-type': 'application/json',
      'svix-id': eventId,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    });
    let verified: Awaited<ReturnType<typeof verifyWebhook>>;
    try {
      verified = await verifyWebhook(
        new globalThis.Request('https://webhook.masarifi.invalid/webhooks/clerk', {
          method: 'POST', headers, body: Uint8Array.from(raw),
        }),
        { signingSecret: this.config.getRequired('CLERK_WEBHOOK_SIGNING_SECRET') },
      );
    } catch {
      throw domainError('WEBHOOK_SIGNATURE_INVALID', 401);
    }
    if (!supportedTypes.has(verified.type)) {
      response.status(204);
      return undefined;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8')) as unknown;
    } catch {
      throw domainError('INVALID_WEBHOOK', 400);
    }
    if (
      !object(payload) || payload.type !== verified.type || !object(payload.data) ||
      !bounded(typeof payload.data.id === 'string' ? payload.data.id : undefined, 128)
    ) {
      throw domainError('INVALID_WEBHOOK', 400);
    }
    try {
      const outcome = await this.repository.receiveClerkWebhook({
        eventId,
        eventType: verified.type as SupportedType,
        verifiedAt: new Date(),
        payloadHash: createHash('sha256').update(raw).digest('hex'),
        payload,
      });
      recordPlatformMetric(IDENTITY_METRICS.webhookReceipt, 1, { outcome });
      if (outcome === 'conflict') throw domainError('WEBHOOK_EVENT_CONFLICT', 409);
      return { accepted: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw domainError('INBOX_UNAVAILABLE', 503);
    }
  }

  private consumeRateLimit(now = Date.now()): void {
    if (now - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = now;
      this.windowCount = 0;
    }
    this.windowCount += 1;
    if (this.windowCount > 120) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
  }
}
