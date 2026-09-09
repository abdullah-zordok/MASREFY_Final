import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

const document = load(
  readFileSync('specs/008-tracking-imports-deduplication/contracts/openapi.yaml', 'utf8'),
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

const id = (suffix: number) => `80000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = '2026-09-09T08:00:00.000Z';

it('accepts complete owner preference, rule, review, and import runtime resources', () => {
  const instances: [string, unknown][] = [
    [
      'TrackingPreferenceResource',
      {
        id: id(1),
        enabled: true,
        reviewRequired: true,
        duplicateWindowSeconds: 86_400,
        sourceRetentionDays: 30,
        historyRetentionDays: 365,
        createdAt: at,
        updatedAt: at,
        version: 2,
      },
    ],
    [
      'TrackingKeywordRuleResource',
      {
        id: id(2),
        keyword: 'paid',
        groupKey: 'expense',
        languageCode: 'en',
        origin: 'custom',
        matchType: 'contains',
        categoryId: null,
        priority: 100,
        enabled: true,
        createdAt: at,
        updatedAt: at,
        version: 3,
      },
    ],
    [
      'TrackingSenderRuleResource',
      {
        id: id(3),
        senderPattern: 'BANK',
        displayLabel: 'Bank',
        institutionId: null,
        trusted: false,
        enabled: true,
        createdAt: at,
        updatedAt: at,
        version: 1,
      },
    ],
    [
      'TrackingReviewResource',
      {
        id: id(4),
        importItemId: id(5),
        reason: 'low_confidence',
        proposedValues: { amountMinor: 1200, currency: 'SAR' },
        originalValues: { amountMinor: 1200 },
        acceptedValues: null,
        status: 'pending',
        decisionAction: null,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: at,
        updatedAt: at,
        version: 1,
      },
    ],
    [
      'TrackingImportSessionResource',
      {
        id: id(6),
        sourceType: 'manual',
        sourceName: null,
        schemaVersion: 1,
        status: 'complete',
        itemCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        attemptCount: 1,
        nextAttemptAt: at,
        startedAt: at,
        completedAt: at,
        createdAt: at,
        updatedAt: at,
        version: 2,
      },
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

it('accepts complete admin import and parser runtime resources', () => {
  const instances: [string, unknown][] = [
    [
      'TrackingAdminImportOverviewResource',
      {
        totalSessions: 4,
        uniqueCustomers: 3,
        totalItems: 9,
        failedSessions: 1,
        reviewSessions: 2,
        highestFailureSource: 'file',
      },
    ],
    [
      'TrackingParserInstitutionResource',
      {
        id: id(7),
        countryCode: 'SA',
        name: 'Bank',
        code: 'bank',
        active: true,
        createdAt: at,
        updatedAt: at,
        version: 1,
      },
    ],
    [
      'TrackingParserRuleResource',
      {
        id: id(8),
        institutionId: id(7),
        name: 'SMS parser',
        sourceType: 'sms',
        activeVersionId: id(9),
        status: 'active',
        createdAt: at,
        updatedAt: at,
        version: 4,
      },
    ],
    [
      'TrackingParserVersionResource',
      {
        id: id(9),
        parserRuleId: id(8),
        versionNo: 2,
        definitionHash: 'a'.repeat(64),
        createdBy: 'admin_123',
        publishedAt: at,
        corpusStatus: 'passed',
        corpusRequestedAt: at,
        corpusAttemptCount: 1,
        corpusNextAttemptAt: at,
        corpusLastErrorCode: null,
        createdAt: at,
      },
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

it('rejects unknown state and extra sensitive fields', () => {
  expect(
    validator('TrackingReviewResource')({
      id: id(4),
      importItemId: id(5),
      reason: 'low_confidence',
      proposedValues: {},
      originalValues: {},
      acceptedValues: null,
      status: 'future',
      decisionAction: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: at,
      updatedAt: at,
      version: 1,
    }),
  ).toBe(false);
  expect(
    validator('TrackingImportSessionResource')({
      id: id(6),
      sourceType: 'manual',
      sourceName: null,
      schemaVersion: 1,
      status: 'complete',
      itemCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      attemptCount: 1,
      nextAttemptAt: at,
      startedAt: at,
      completedAt: at,
      createdAt: at,
      updatedAt: at,
      version: 2,
      requestHash: 'secret',
    }),
  ).toBe(false);
});

it('requires the server occurrence time on mutation envelopes', () => {
  const instance = {
    operationId: id(10),
    replayed: false,
    resource: {
      id: id(6),
      sourceType: 'manual',
      sourceName: null,
      schemaVersion: 1,
      status: 'complete',
      itemCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      attemptCount: 1,
      nextAttemptAt: at,
      startedAt: at,
      completedAt: at,
      createdAt: at,
      updatedAt: at,
      version: 2,
    },
    requestId: 'tracking-contract-instance',
    occurredAt: at,
  };
  const validate = validator('TrackingMutationEnvelope');

  expect(validate(instance)).toBe(true);
  expect(validate({ ...instance, occurredAt: undefined })).toBe(false);
});
