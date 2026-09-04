import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { Controller, Headers, HttpCode, HttpException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import { ReportsRepository } from './reports.repository';

@Controller('webhooks/report-delivery')
export class ReportsWebhookController {
  constructor(private readonly config: PlatformConfigService, private readonly repository: ReportsRepository) {}

  @Post()
  @HttpCode(202)
  async receive(
    @Req() request: Request,
    @Headers('x-report-event-id') eventId?: string,
    @Headers('x-report-timestamp') timestamp?: string,
    @Headers('x-report-signature') signature?: string,
  ): Promise<{ accepted: true }> {
    const secret = this.config.get('EMAIL_DELIVERY_WEBHOOK_SECRET');
    if (!secret) throw new HttpException({ code: 'NOT_FOUND' }, 404);
    const timestampValue = timestamp ?? '';
    if (!Buffer.isBuffer(request.body) || !eventId || eventId.length > 128 || !/^\d{10}$/.test(timestampValue) || !/^v1=[a-f0-9]{64}$/.test(signature ?? ''))
      throw new HttpException({ code: 'WEBHOOK_SIGNATURE_INVALID' }, 401);
    const seconds = Number(timestampValue);
    if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300)
      throw new HttpException({ code: 'WEBHOOK_SIGNATURE_INVALID' }, 401);
    const expected = createHmac('sha256', secret).update(`${eventId}.${timestampValue}.`).update(request.body).digest();
    const supplied = Buffer.from((signature ?? '').slice(3), 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new HttpException({ code: 'WEBHOOK_SIGNATURE_INVALID' }, 401);
    const hash = createHash('sha256').update(request.body).digest('hex');
    if (await this.repository.captureDeliveryWebhook(eventId, hash) === 'conflict')
      throw new HttpException({ code: 'WEBHOOK_EVENT_CONFLICT' }, 409);
    return { accepted: true };
  }
}
