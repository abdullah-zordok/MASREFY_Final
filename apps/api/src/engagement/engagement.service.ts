import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { EngagementRepository, type EngagementCommand } from './engagement.repository';
import { validateEngagementCommand } from './engagement.dto';
import { SupportStorage } from './support.storage';
import { PublishedContentCache } from './content.service';
import { SecurityRepository } from '../security/security.repository';

@Injectable()
export class EngagementService {
  private readonly contentCache = new PublishedContentCache();

  constructor(
    private readonly repository: EngagementRepository,
    private readonly storage: SupportStorage,
    private readonly security: SecurityRepository,
  ) {}

  async execute(principal: ClerkPrincipal, command: EngagementCommand): Promise<unknown> {
    try {
      const validated = validateEngagementCommand(command);
      if (validated.idempotencyKey) {
        const allowed = await this.security.consumeRateLimit(
          principal,
          validated.operation.startsWith('admin') ? 'engagement.admin.write' : 'engagement.write',
          validated.operation.includes('Attachment') ? 20 : 60,
          60,
          null,
        );
        if (!allowed) throw new HttpException({ code: 'RATE_LIMITED' }, 429);
      }
      if (
        validated.operation === 'listPublishedContent' ||
        validated.operation === 'getPublishedContent'
      ) {
        const query = (validated.query ?? {}) as Record<string, unknown>;
        const params = validated.params ?? {};
        return await this.contentCache.get(
          {
            locale: query.locale === 'ar' ? 'ar' : 'en',
            type: (query.type ?? 'all') as 'all' | 'article' | 'faq' | 'policy' | 'announcement',
            query: typeof query.query === 'string' ? query.query : '',
            cursor: typeof query.cursor === 'string' ? query.cursor : '',
            version: 1,
            ...(params.contentKey ? { contentKey: params.contentKey } : {}),
          },
          () => this.repository.execute(principal, validated),
        );
      }
      if (validated.operation === 'finalizeSupportAttachment') {
        const input = validated.body as Record<string, unknown>;
        await this.repository.execute(principal, {
          operation: 'getSupportTicket',
          params: { ticketId: String(validated.params?.ticketId) },
          query: { limit: 1 },
          requestId: validated.requestId,
        });
        await this.storage.verify(
          `support/${String(validated.params?.ticketId)}/${String(input.uploadId)}`,
          Number(input.sizeBytes),
          String(input.contentType),
          String(input.sha256),
        );
      }
      const result = await this.repository.execute(principal, validated);
      if (validated.operation === 'adminActOnContent') this.contentCache.clear();
      const value = result as Record<string, unknown>;
      if (validated.operation === 'setNotificationRead')
        return await this.readById(principal, 'getNotification', 'notificationId', value.id);
      if (validated.operation === 'actOnNotification')
        return {
          resourceId: value.id,
          outcome: 'success',
          currentState: 'acted',
          version: value.version,
          requestId: validated.requestId,
        };
      if (validated.operation === 'replaceNotificationPreferences')
        return await this.repository.execute(principal, {
          operation: 'getNotificationPreferences',
          requestId: validated.requestId,
        });
      if (validated.operation === 'createSupportTicket')
        return await this.readById(principal, 'getSupportTicket', 'ticketId', value.resourceId);
      if (validated.operation === 'addSupportMessage')
        return await this.readById(principal, 'getSupportTicket', 'ticketId', value.ticketId);
      if (['closeSupportTicket', 'reopenSupportTicket'].includes(validated.operation))
        return await this.readById(principal, 'getSupportTicket', 'ticketId', value.resourceId);
      if (validated.operation === 'createFeedback')
        return await this.readById(principal, 'getFeedback', 'feedbackId', value.resourceId);
      if (validated.operation === 'createAbuseReport') {
        const listed = (await this.repository.execute(principal, {
          operation: 'listOwnAbuseReports',
          query: { limit: 100 },
          requestId: validated.requestId,
        })) as { items: Record<string, unknown>[] };
        return listed.items.find((item) => item.id === value.resourceId) ?? value;
      }
      if (validated.operation === 'initializeSupportAttachment') {
        const value = result as Record<string, unknown>;
        const input = validated.body as Record<string, unknown>;
        const signed = await this.storage.signUpload(
          String(value.storageRef),
          String(input.contentType),
          String(input.sha256),
        );
        return { uploadId: value.uploadId, ...signed };
      }
      if (validated.operation === 'downloadSupportAttachment') {
        const value = result as Record<string, unknown>;
        return await this.storage.signDownload(String(value.storageRef));
      }
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        error instanceof Error &&
        (error.message.startsWith('ENGAGEMENT_') || error.message === 'IDEMPOTENCY_KEY_INVALID')
      )
        throw new HttpException({ code: error.message }, 400);
      if (
        error instanceof Error &&
        ['SUPPORT_STORAGE_INVALID', 'SUPPORT_STORAGE_METADATA_MISMATCH'].includes(error.message)
      )
        throw new HttpException({ code: error.message }, 400);
      throw new HttpException({ code: 'ENGAGEMENT_UNAVAILABLE' }, 503);
    }
  }

  private readById(
    principal: ClerkPrincipal,
    operation: string,
    parameter: string,
    id: unknown,
  ): Promise<unknown> {
    if (typeof id !== 'string') throw new Error('ENGAGEMENT_COMMAND_FAILED');
    return this.repository.execute(principal, {
      operation,
      params: { [parameter]: id },
      query: { limit: 100 },
      requestId: 'engagement-follow-up-read',
    });
  }
}
