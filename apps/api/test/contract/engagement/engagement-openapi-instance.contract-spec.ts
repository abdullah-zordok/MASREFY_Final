import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

import { safeError } from '../../../src/platform/http/safe-exception.filter';

const document = load(
  readFileSync('specs/011-notifications-support-content/contracts/openapi.yaml', 'utf8'),
) as { components: { schemas: Record<string, unknown> } };
const ajv = new Ajv({ strict: false });
addFormats(ajv);

function validator(name: string): ValidateFunction {
  if (!document.components.schemas[name]) throw new Error(`${name} schema is missing`);
  return ajv.compile({
    $ref: `#/components/schemas/${name}`,
    components: document.components,
  });
}

const id = (suffix: number) => `11000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = '2026-09-10T08:00:00.000Z';
const ticket = {
  id: id(2),
  categoryId: id(3),
  subject: 'Card payment needs review',
  status: 'waiting_support',
  priority: 'high',
  lastMessageAt: at,
  closedAt: null,
  version: 2,
  createdAt: at,
};

it('accepts real engagement cursor pages, preferences, categories, ticket detail, and errors', () => {
  const instances: [string, unknown][] = [
    [
      'NotificationPage',
      {
        items: [
          {
            id: id(1),
            type: 'transaction_detected',
            title: 'Transaction detected',
            body: 'Review the detected transaction.',
            dataSafe: { transactionAlias: 'TX-1', amountMinor: 1250 },
            readAt: null,
            actedAt: null,
            expiresAt: at,
            actions: [{ key: 'view', expiresAt: at }],
            version: 1,
            createdAt: at,
          },
        ],
        nextCursor: 'cursor-2',
        hasMore: true,
        unreadCount: 1,
      },
    ],
    [
      'PreferenceMatrix',
      {
        items: [
          {
            channel: 'push',
            eventType: 'transaction_detected',
            enabled: true,
            quietHours: {
              enabled: true,
              start: '22:00',
              end: '07:00',
              weekdays: [0, 1, 2, 3, 4, 5, 6],
              timeZone: 'Asia/Riyadh',
            },
            version: 2,
          },
        ],
        version: 2,
      },
    ],
    [
      'PreferenceMatrixInput',
      {
        items: [],
        version: 2,
        expectedVersion: 2,
      },
    ],
    [
      'SupportCategoryPage',
      {
        items: [
          {
            id: id(3),
            key: 'card_payment',
            name: 'Card payment',
            sortOrder: 10,
            active: true,
            version: 1,
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
    ],
    ['TicketPage', { items: [ticket], nextCursor: null, hasMore: false }],
    ['FeedbackPage', { items: [], nextCursor: null, hasMore: false }],
    ['AbusePage', { items: [], nextCursor: null, hasMore: false }],
    ['ContentPage', { items: [], nextCursor: null, hasMore: false }],
    ['AdminSupportCategoryPage', { items: [], nextCursor: null, hasMore: false }],
    ['AdminFeedbackPage', { items: [], nextCursor: null, hasMore: false }],
    ['AdminAbuseReportPage', { items: [], nextCursor: null, hasMore: false }],
    ['AdminContentPage', { items: [], nextCursor: null, hasMore: false }],
    ['EngagementAdminPage', { items: [], nextCursor: null, hasMore: false }],
    [
      'TicketDetail',
      {
        ...ticket,
        messages: [
          {
            id: id(4),
            senderType: 'customer',
            body: 'Please review this payment.',
            attachments: [
              {
                id: id(5),
                filename: 'receipt.png',
                contentType: 'image/png',
                sizeBytes: 2048,
                status: 'clean',
              },
            ],
            createdAt: at,
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
    ],
    [
      'AdminTicketDetail',
      {
        ...ticket,
        messages: [],
        nextCursor: null,
        hasMore: false,
        internalNotes: [{ id: id(6), body: 'Reviewed by support.', createdAt: at }],
      },
    ],
    [
      'ErrorResponse',
      safeError(400, 'engagement-contract-instance', [
        { field: 'status', code: 'INVALID', message: 'Invalid value' },
      ]),
    ],
  ];

  for (const [schema, instance] of instances) {
    const validate = validator(schema);
    expect({ schema, valid: validate(instance), errors: validate.errors }).toEqual({
      schema,
      valid: true,
      errors: null,
    });
  }
});

it('rejects unknown engagement response fields', () => {
  expect(
    validator('TicketPage')({
      items: [],
      nextCursor: null,
      hasMore: false,
      internalNotes: ['must not reach an owner list'],
    }),
  ).toBe(false);
});
