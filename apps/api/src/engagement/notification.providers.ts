import type { MailTransport } from '../reports/reports.smtp';

export interface PushInput {
  token: string;
  eventId: string;
  title: string;
  body: string;
  route: string;
}

export type ProviderResult =
  | { status: 'accepted'; providerRef: string }
  | { status: 'retryable' | 'terminal' | 'ambiguous'; code: string };

export interface NotificationProvider {
  send(input: PushInput): Promise<ProviderResult>;
}

export type HttpTransport = (request: {
  url: string;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  timeoutMs: number;
}) => Promise<{ status: number; json: unknown }>;

export function safePushPayload(input: PushInput) {
  if (
    !/^[0-9a-f-]{36}$/i.test(input.eventId) ||
    !/^[a-z][a-z0-9_]{1,63}$/.test(input.route) ||
    input.title.length > 120 ||
    input.body.length > 240 ||
    /[\r\n]/.test(input.title)
  )
    throw new Error('NOTIFICATION_PAYLOAD_INVALID');
  return {
    to: input.token,
    title: input.title,
    body: input.body,
    data: { eventId: input.eventId, route: input.route },
  };
}

export class DeterministicNotificationProvider implements NotificationProvider {
  constructor(private readonly mode: 'success' | 'retryable' | 'terminal' | 'ambiguous') {}

  send(input: PushInput): Promise<ProviderResult> {
    safePushPayload(input);
    if (this.mode === 'success')
      return Promise.resolve({ status: 'accepted', providerRef: 'deterministic-accepted' });
    if (this.mode === 'retryable')
      return Promise.resolve({ status: 'retryable', code: 'PROVIDER_TEMPORARY' });
    if (this.mode === 'terminal')
      return Promise.resolve({ status: 'terminal', code: 'TOKEN_INVALID' });
    return Promise.resolve({ status: 'ambiguous', code: 'PROVIDER_ACCEPTANCE_UNKNOWN' });
  }
}

export class ExpoPushProvider implements NotificationProvider {
  constructor(
    private readonly transport: HttpTransport,
    private readonly accessToken: string,
  ) {}

  async send(input: PushInput): Promise<ProviderResult> {
    const response = await this.transport({
      url: 'https://exp.host/--/api/v2/push/send',
      headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
      body: safePushPayload(input),
      timeoutMs: 5_000,
    });
    if (response.status === 429 || response.status >= 500)
      return { status: 'retryable', code: 'PROVIDER_TEMPORARY' };
    if (response.status < 200 || response.status >= 300)
      return { status: 'terminal', code: 'PROVIDER_REJECTED' };
    const data = (
      response.json as { data?: { status?: string; id?: string; details?: { error?: string } } }
    ).data;
    if (data?.status === 'ok' && typeof data.id === 'string')
      return { status: 'accepted', providerRef: data.id };
    if (data?.details?.error === 'DeviceNotRegistered')
      return { status: 'terminal', code: 'TOKEN_INVALID' };
    return { status: 'ambiguous', code: 'PROVIDER_RESPONSE_INVALID' };
  }
}

export class FcmPushProvider implements NotificationProvider {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string,
    private readonly accessToken: string,
  ) {}

  async send(input: PushInput): Promise<ProviderResult> {
    const payload = safePushPayload(input);
    const response = await this.transport({
      url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
      headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
      body: {
        message: {
          token: payload.to,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
        },
      },
      timeoutMs: 5_000,
    });
    if (response.status === 429 || response.status >= 500)
      return { status: 'retryable', code: 'PROVIDER_TEMPORARY' };
    if (response.status === 404 || response.status === 400)
      return { status: 'terminal', code: 'TOKEN_INVALID' };
    const name = (response.json as { name?: unknown }).name;
    return response.status >= 200 && response.status < 300 && typeof name === 'string'
      ? { status: 'accepted', providerRef: name }
      : { status: 'ambiguous', code: 'PROVIDER_RESPONSE_INVALID' };
  }
}

export class ApnsPushProvider implements NotificationProvider {
  constructor(
    private readonly transport: HttpTransport,
    private readonly bearerToken: string,
    private readonly topic: string,
  ) {}

  async send(input: PushInput): Promise<ProviderResult> {
    const payload = safePushPayload(input);
    const response = await this.transport({
      url: `https://api.push.apple.com/3/device/${encodeURIComponent(input.token)}`,
      headers: {
        authorization: `bearer ${this.bearerToken}`,
        'apns-id': input.eventId,
        'apns-topic': this.topic,
        'content-type': 'application/json',
      },
      body: {
        aps: { alert: { title: payload.title, body: payload.body } },
        eventId: payload.data.eventId,
        route: payload.data.route,
      },
      timeoutMs: 5_000,
    });
    if (response.status === 429 || response.status >= 500)
      return { status: 'retryable', code: 'PROVIDER_TEMPORARY' };
    if (response.status === 400 || response.status === 410)
      return { status: 'terminal', code: 'TOKEN_INVALID' };
    return response.status >= 200 && response.status < 300
      ? { status: 'accepted', providerRef: input.eventId }
      : { status: 'ambiguous', code: 'PROVIDER_RESPONSE_INVALID' };
  }
}

export class NotificationEmailProvider {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async send(
    eventId: string,
    recipient: string,
    subject: string,
    body: string,
  ): Promise<ProviderResult> {
    if (
      !/^[0-9a-f-]{36}$/i.test(eventId) ||
      !/^[^\s@\r\n]+@[^\s@\r\n]+$/.test(recipient) ||
      recipient.length > 320 ||
      subject.length < 1 ||
      subject.length > 120 ||
      /[\r\n]/.test(subject) ||
      body.length < 1 ||
      body.length > 4096 ||
      body.includes('\r')
    )
      throw new Error('NOTIFICATION_EMAIL_INVALID');
    const domain = this.from.slice(this.from.lastIndexOf('@') + 1);
    const messageId = `<notification-${eventId}@${domain}>`;
    try {
      const result = await this.transport.sendMail({
        from: this.from,
        to: recipient,
        envelope: { from: this.from, to: recipient },
        subject,
        text: body,
        messageId,
        attachments: undefined,
      });
      return (result.accepted ?? []).some(
        (value) => String(value).toLowerCase() === recipient.toLowerCase(),
      )
        ? { status: 'accepted', providerRef: messageId }
        : { status: 'terminal', code: 'PROVIDER_REJECTED' };
    } catch (error) {
      const failure = error as { responseCode?: number; code?: string; command?: string };
      if (failure.code === 'ETIMEDOUT' && failure.command === 'DATA')
        return { status: 'ambiguous', code: 'PROVIDER_ACCEPTANCE_UNKNOWN' };
      return (failure.responseCode ?? 0) >= 500
        ? { status: 'terminal', code: 'PROVIDER_REJECTED' }
        : { status: 'retryable', code: 'PROVIDER_TEMPORARY' };
    }
  }
}
