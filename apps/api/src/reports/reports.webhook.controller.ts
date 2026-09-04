import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { Controller, Headers, HttpCode, HttpException, Post, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { ReportsRepository } from './reports.repository';
import { isReportUuid } from './reports.schemas';

function parseDeliveryEvent(body: Buffer): { attemptId: string; type: 'accepted' | 'rejected' } {
  let value: unknown;
  try {
    value = JSON.parse(body.toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new HttpException({ code: 'WEBHOOK_PAYLOAD_INVALID' }, 400);
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpException({ code: 'WEBHOOK_PAYLOAD_INVALID' }, 400);
  const event = value as Record<string, unknown>;
  if (
    Object.keys(event).length !== 2 ||
    !isReportUuid(event.attemptId) ||
    (event.type !== 'accepted' && event.type !== 'rejected')
  )
    throw new HttpException({ code: 'WEBHOOK_PAYLOAD_INVALID' }, 400);
  return { attemptId: event.attemptId, type: event.type };
}

@Controller('webhooks/report-delivery')
export class ReportsWebhookController {
  constructor(
    private readonly config: PlatformConfigService,
    private readonly repository: ReportsRepository,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: 'acceptReportDeliveryWebhook' })
  async receive(
    @Req() request: Request,
    @Headers('x-report-event-id') eventId?: string,
    @Headers('x-report-timestamp') timestamp?: string,
    @Headers('x-report-signature') signature?: string,
  ): Promise<{ accepted: true }> {
    const secret = this.config.get('EMAIL_DELIVERY_WEBHOOK_SECRET');
    if (!secret) throw new HttpException({ code: 'NOT_FOUND' }, 404);
    const timestampValue = timestamp ?? '';
    if (
      !Buffer.isBuffer(request.body) ||
      !eventId ||
      eventId.length < 1 ||
      eventId.length > 128 ||
      // eslint-disable-next-line no-control-regex -- provider identifiers reject all controls
      /[\u0000-\u001f\u007f]/u.test(eventId) ||
      !/^\d{10}$/.test(timestampValue) ||
      !/^v1=[a-f0-9]{64}$/.test(signature ?? '')
    )
      throw new HttpException({ code: 'WEBHOOK_SIGNATURE_INVALID' }, 401);
    const seconds = Number(timestampValue);
    if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300)
      throw new HttpException({ code: 'WEBHOOK_SIGNATURE_INVALID' }, 401);
    const expected = createHmac('sha256', secret)
      .update(`${eventId}.${timestampValue}.`)
      .update(request.body)
      .digest();
    const supplied = Buffer.from((signature ?? '').slice(3), 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new HttpException({ code: 'WEBHOOK_SIGNATURE_INVALID' }, 401);
    parseDeliveryEvent(request.body);
    const eventKeyHash = `sha256:${createHash('sha256').update(eventId).digest('hex')}`;
    const payloadHash = `sha256:${createHash('sha256').update(request.body).digest('hex')}`;
    if ((await this.repository.captureDeliveryWebhook(eventKeyHash, payloadHash)) === 'conflict')
      throw new HttpException({ code: 'WEBHOOK_EVENT_CONFLICT' }, 409);
    return { accepted: true };
  }
}
