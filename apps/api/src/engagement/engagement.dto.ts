import {
  engagementRecord,
  engagementUuid,
  exactKeys,
  safeJsonObject,
  safeKey,
  safePageQuery,
  safeText,
  safeVersion,
} from './engagement.schemas';
import type { EngagementCommand } from './engagement.repository';
import { ENGAGEMENT_SOURCE_EVENTS } from './engagement.events';
import { parseAudience } from './campaign.service';
import { renderNotification } from './notification.renderer';

const READS = new Set([
  'listNotifications',
  'getNotification',
  'getNotificationPreferences',
  'listSupportCategories',
  'listSupportTickets',
  'getSupportTicket',
  'downloadSupportAttachment',
  'listFeedback',
  'getFeedback',
  'listOwnAbuseReports',
  'listPublishedContent',
  'getPublishedContent',
  'adminListNotificationTemplates',
  'adminListNotificationCampaigns',
  'adminGetNotificationCampaign',
  'adminListNotificationDeliveries',
  'adminListSupportTickets',
  'adminGetSupportTicket',
  'adminListSupportCategories',
  'adminListFeedback',
  'adminGetFeedback',
  'adminListAbuseReports',
  'adminListContent',
  'adminGetContent',
]);

const UUID_PARAMS = new Set([
  'notificationId',
  'ticketId',
  'attachmentId',
  'categoryId',
  'feedbackId',
  'templateId',
  'campaignId',
  'deliveryId',
  'reportId',
  'contentId',
]);

const BODY_SHAPES: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
  setNotificationRead: [
    ['read', 'expectedVersion'],
    ['read', 'expectedVersion'],
  ],
  actOnNotification: [
    ['actionKey', 'expectedVersion'],
    ['actionKey', 'expectedVersion'],
  ],
  replaceNotificationPreferences: [
    ['items', 'version', 'expectedVersion'],
    ['items', 'version', 'expectedVersion'],
  ],
  createSupportTicket: [
    ['categoryId', 'subject', 'message'],
    ['categoryId', 'subject', 'message'],
  ],
  addSupportMessage: [
    ['body', 'expectedVersion', 'attachmentUploadIds'],
    ['body', 'expectedVersion'],
  ],
  closeSupportTicket: [['expectedVersion'], ['expectedVersion']],
  reopenSupportTicket: [
    ['expectedVersion', 'reason'],
    ['expectedVersion', 'reason'],
  ],
  initializeSupportAttachment: [
    ['filename', 'contentType', 'sizeBytes', 'sha256'],
    ['filename', 'contentType', 'sizeBytes', 'sha256'],
  ],
  finalizeSupportAttachment: [
    ['uploadId', 'filename', 'contentType', 'sizeBytes', 'sha256', 'expectedVersion'],
    ['uploadId', 'filename', 'contentType', 'sizeBytes', 'sha256', 'expectedVersion'],
  ],
  createFeedback: [
    ['type', 'subject', 'body'],
    ['type', 'body'],
  ],
  createAbuseReport: [
    ['resourceType', 'resourceId', 'reason'],
    ['resourceType', 'resourceId', 'reason'],
  ],
  adminCreateNotificationTemplate: [
    ['key', 'locale', 'channel', 'subject', 'body', 'variables'],
    ['key', 'locale', 'channel', 'body', 'variables'],
  ],
  adminActOnNotificationTemplate: [
    ['action', 'expectedVersion', 'reason'],
    ['action', 'expectedVersion', 'reason'],
  ],
  adminPreviewNotificationAudience: [['platforms', 'locales', 'activity', 'segmentKeys'], []],
  adminCreateNotificationCampaign: [
    [
      'name',
      'templateId',
      'previewId',
      'audienceVersion',
      'audience',
      'scheduleMode',
      'scheduledAt',
    ],
    ['name', 'templateId', 'previewId', 'audienceVersion', 'audience', 'scheduleMode'],
  ],
  adminActOnNotificationCampaign: [
    ['action', 'expectedVersion', 'reason', 'scheduledAt'],
    ['action', 'expectedVersion', 'reason'],
  ],
  adminRetryNotificationDelivery: [
    ['expectedVersion', 'reason'],
    ['expectedVersion', 'reason'],
  ],
  adminActOnSupportTicket: [
    ['action', 'expectedVersion', 'reason', 'assigneeId', 'priority', 'message'],
    ['action', 'expectedVersion', 'reason'],
  ],
  adminAddSupportInternalNote: [
    ['body', 'expectedVersion', 'reason'],
    ['body', 'expectedVersion', 'reason'],
  ],
  adminCreateSupportCategory: [
    ['key', 'name', 'sortOrder'],
    ['key', 'name', 'sortOrder'],
  ],
  adminActOnSupportCategory: [
    ['action', 'expectedVersion', 'reason', 'replacementCategoryId'],
    ['action', 'expectedVersion', 'reason'],
  ],
  adminActOnFeedback: [
    ['action', 'expectedVersion', 'reason', 'assigneeId'],
    ['action', 'expectedVersion', 'reason'],
  ],
  adminActOnAbuseReport: [
    ['action', 'expectedVersion', 'reason'],
    ['action', 'expectedVersion', 'reason'],
  ],
  adminCreateContent: [
    ['key', 'type', 'translations'],
    ['key', 'type', 'translations'],
  ],
  adminActOnContent: [
    ['action', 'expectedVersion', 'reason', 'translations'],
    ['action', 'expectedVersion', 'reason'],
  ],
};

export function validateEngagementCommand(command: EngagementCommand): EngagementCommand {
  if (READS.has(command.operation)) {
    const page = safePageQuery(command.query);
    if (!command.operation.startsWith('admin') && page.limit > 100)
      throw new Error('ENGAGEMENT_INPUT_INVALID');
  }
  const query = (command.query ?? {}) as Record<string, unknown>;
  if (
    ['listPublishedContent', 'adminListContent'].includes(command.operation) &&
    query.type !== undefined &&
    (typeof query.type !== 'string' ||
      !['article', 'faq', 'policy', 'announcement'].includes(query.type))
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (
    ['listPublishedContent', 'getPublishedContent'].includes(command.operation) &&
    !['ar', 'en'].includes(typeof query.locale === 'string' ? query.locale : '')
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  const params = command.params ?? {};
  for (const [key, value] of Object.entries(params)) {
    if (UUID_PARAMS.has(key)) engagementUuid(value);
    else if (key === 'contentKey') safeKey(value);
    else throw new Error('ENGAGEMENT_INPUT_INVALID');
  }
  const shape = BODY_SHAPES[command.operation];
  if (shape) {
    const body = command.body === undefined ? {} : engagementRecord(command.body);
    exactKeys(body, shape[0], shape[1]);
    if ('expectedVersion' in body) safeVersion(body.expectedVersion);
    if ('version' in body) safeVersion(body.version);
    for (const key of ['body', 'message', 'reason'])
      if (body[key] !== undefined) safeText(body[key], 8_192);
    for (const key of ['subject', 'name', 'filename'])
      if (body[key] !== undefined && body[key] !== null)
        safeText(body[key], key === 'filename' ? 255 : 180);
    if ('audience' in body) safeJsonObject(body.audience, 4_096);
    for (const key of ['categoryId', 'templateId', 'previewId', 'uploadId'])
      if (body[key] !== undefined) engagementUuid(body[key]);
    for (const key of ['key', 'actionKey']) if (body[key] !== undefined) safeKey(body[key]);
    if (
      'sizeBytes' in body &&
      (!Number.isSafeInteger(body.sizeBytes) ||
        Number(body.sizeBytes) < 1 ||
        Number(body.sizeBytes) > 10_485_760)
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    if (
      'sha256' in body &&
      (typeof body.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.sha256))
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    if (
      'contentType' in body &&
      !['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(
        String(body.contentType),
      )
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    if ('read' in body && typeof body.read !== 'boolean')
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    validateOperationBody(command.operation, body);
  }
  if (!READS.has(command.operation) && !shape) throw new Error('ENGAGEMENT_OPERATION_INVALID');
  if (
    shape &&
    (!command.idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(command.idempotencyKey))
  )
    throw new Error('IDEMPOTENCY_KEY_INVALID');
  return command;
}

function validateOperationBody(operation: string, body: Record<string, unknown>): void {
  const oneOf = (key: string, values: readonly string[]) => {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || !values.includes(body[key])))
      throw new Error('ENGAGEMENT_INPUT_INVALID');
  };
  oneOf('locale', ['ar', 'en']);
  oneOf('channel', ['in_app', 'push', 'email']);
  if (operation === 'actOnNotification') oneOf('actionKey', ['view', 'edit', 'undo']);
  if (operation === 'createFeedback') oneOf('type', ['bug', 'idea', 'experience', 'other']);
  if (operation === 'createAbuseReport')
    oneOf('resourceType', ['content', 'support_message', 'assistant_response', 'other']);
  if (operation === 'adminActOnNotificationTemplate')
    oneOf('action', ['test', 'publish', 'retire']);
  if (operation === 'adminActOnNotificationCampaign')
    oneOf('action', ['approve', 'schedule', 'send_now', 'pause', 'resume', 'cancel']);
  if (operation === 'adminActOnSupportTicket')
    oneOf('action', ['assign', 'priority', 'reply', 'resolve', 'close', 'reopen']);
  if (operation === 'adminActOnSupportCategory') oneOf('action', ['activate', 'retire']);
  if (operation === 'adminActOnFeedback')
    oneOf('action', ['assign', 'review', 'plan', 'resolve', 'close']);
  if (operation === 'adminActOnAbuseReport') oneOf('action', ['review', 'action', 'dismiss']);
  if (operation === 'adminActOnContent') oneOf('action', ['review', 'publish', 'retire']);
  oneOf('priority', ['low', 'normal', 'high', 'urgent']);
  oneOf(
    'type',
    operation.includes('Content')
      ? ['article', 'faq', 'policy', 'announcement']
      : operation === 'createFeedback'
        ? ['bug', 'idea', 'experience', 'other']
        : [],
  );

  if (operation === 'adminPreviewNotificationAudience') parseAudience(body);
  if (operation === 'adminCreateNotificationCampaign') {
    parseAudience(body.audience);
    oneOf('scheduleMode', ['send_now', 'scheduled']);
    if (
      (body.scheduleMode === 'scheduled') !== (typeof body.scheduledAt === 'string') ||
      (typeof body.scheduledAt === 'string' &&
        (!Number.isFinite(Date.parse(body.scheduledAt)) ||
          Date.parse(body.scheduledAt) <= Date.now()))
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
  }
  if (operation === 'adminCreateNotificationTemplate') {
    if (!ENGAGEMENT_SOURCE_EVENTS.has(String(body.key)))
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    if (
      !Array.isArray(body.variables) ||
      body.variables.length > 0 ||
      new Set(body.variables).size !== body.variables.length
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    if (
      body.variables.some(
        (value) => typeof value !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(value),
      )
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    safeText(body.body, 4096);
    if (body.subject !== null && body.subject !== undefined) safeText(body.subject, 120);
    try {
      renderNotification(
        {
          key: String(body.key),
          locale: body.locale as 'ar' | 'en',
          channel: body.channel as 'in_app' | 'push' | 'email',
          version: 1,
          title: 'Masarifi',
          ...(typeof body.subject === 'string' ? { subject: body.subject } : {}),
          body: String(body.body),
          allowedVariables: [],
        },
        {},
      );
    } catch {
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    }
  }
  if (body.reason !== undefined) {
    const reason = safeText(body.reason, 500);
    if (!reason || reason.length < 10) throw new Error('ENGAGEMENT_INPUT_INVALID');
  }
  if (operation === 'adminActOnNotificationCampaign') {
    if (
      (body.action === 'schedule') !== (typeof body.scheduledAt === 'string') ||
      (typeof body.scheduledAt === 'string' &&
        (!Number.isFinite(Date.parse(body.scheduledAt)) ||
          Date.parse(body.scheduledAt) <= Date.now()))
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
  }
  if (operation === 'adminActOnSupportTicket') {
    const requiredField =
      body.action === 'assign'
        ? 'assigneeId'
        : body.action === 'priority'
          ? 'priority'
          : body.action === 'reply'
            ? 'message'
            : undefined;
    if (requiredField && body[requiredField] === undefined)
      throw new Error('ENGAGEMENT_INPUT_INVALID');
  }
  if (operation === 'replaceNotificationPreferences') validatePreferences(body.items);
  if (
    operation === 'adminCreateContent' ||
    (operation === 'adminActOnContent' && body.translations !== undefined)
  )
    validateTranslations(body.translations);
  if (body.attachmentUploadIds !== undefined) validateUuidList(body.attachmentUploadIds, 6);
  if (typeof body.filename === 'string' && /[\\/]/.test(body.filename))
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  if (body.assigneeId !== undefined && body.assigneeId !== null) safeText(body.assigneeId, 128);
  if (body.replacementCategoryId !== undefined) engagementUuid(body.replacementCategoryId);
  if (body.resourceId !== undefined) safeText(body.resourceId, 128);
  if (
    body.sortOrder !== undefined &&
    (!Number.isInteger(body.sortOrder) || Number(body.sortOrder) < 0)
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
}

function validateUuidList(value: unknown, maximum: number): void {
  if (!Array.isArray(value) || value.length > maximum || new Set(value).size !== value.length)
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  for (const item of value) engagementUuid(item);
}

function validateTranslations(value: unknown): void {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2)
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  const locales = new Set<string>();
  for (const item of value) {
    const translation = engagementRecord(item);
    exactKeys(translation, ['locale', 'title', 'body'], ['locale', 'title', 'body']);
    if (
      !['ar', 'en'].includes(String(translation.locale)) ||
      locales.has(String(translation.locale))
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    locales.add(String(translation.locale));
    safeText(translation.title, 180);
    safeText(translation.body, 65_536);
  }
}

function validatePreferences(value: unknown): void {
  if (!Array.isArray(value) || value.length !== ENGAGEMENT_SOURCE_EVENTS.size * 3)
    throw new Error('ENGAGEMENT_INPUT_INVALID');
  const seen = new Set<string>();
  for (const item of value) {
    const preference = engagementRecord(item);
    exactKeys(
      preference,
      ['channel', 'eventType', 'enabled', 'quietHours'],
      ['channel', 'eventType', 'enabled', 'quietHours'],
    );
    if (
      !['in_app', 'push', 'email'].includes(String(preference.channel)) ||
      !ENGAGEMENT_SOURCE_EVENTS.has(String(preference.eventType)) ||
      typeof preference.enabled !== 'boolean'
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    const key = `${String(preference.eventType)}:${String(preference.channel)}`;
    if (seen.has(key)) throw new Error('ENGAGEMENT_INPUT_INVALID');
    seen.add(key);
    const quiet = engagementRecord(preference.quietHours);
    exactKeys(
      quiet,
      ['enabled', 'start', 'end', 'weekdays', 'timeZone'],
      ['enabled', 'start', 'end', 'weekdays', 'timeZone'],
    );
    if (
      typeof quiet.enabled !== 'boolean' ||
      typeof quiet.start !== 'string' ||
      !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(quiet.start) ||
      typeof quiet.end !== 'string' ||
      !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(quiet.end) ||
      typeof quiet.timeZone !== 'string'
    )
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    validateWeekdays(quiet.weekdays);
    try {
      new Intl.DateTimeFormat('en', { timeZone: quiet.timeZone }).format();
    } catch {
      throw new Error('ENGAGEMENT_INPUT_INVALID');
    }
  }
}

function validateWeekdays(value: unknown): void {
  if (
    !Array.isArray(value) ||
    value.length > 7 ||
    new Set(value).size !== value.length ||
    value.some((day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6)
  )
    throw new Error('ENGAGEMENT_INPUT_INVALID');
}
