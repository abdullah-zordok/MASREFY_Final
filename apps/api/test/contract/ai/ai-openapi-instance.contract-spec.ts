import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

import { safeError } from '../../../src/platform/http/safe-exception.filter';

const document = load(
  readFileSync('specs/009-voice-openrouter-financial-assistant/contracts/openapi.yaml', 'utf8'),
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

const id = (suffix: number) => `90000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = '2026-09-09T08:00:00.000Z';

it('accepts complete quota, preference, Admin mutation, and assistant message instances', () => {
  const instances: [string, unknown][] = [
    [
      'AssistantAvailability',
      { status: 'available', limit: 5, used: 2, remaining: 3, resetsAt: at },
    ],
    [
      'QuotaError',
      safeError(429, 'ai-contract-instance', [], 'AI_QUOTA_EXCEEDED', {
        limit: 5,
        used: 5,
        resetsAt: at,
      }),
    ],
    [
      'VoiceCategoryPreference',
      {
        id: id(1),
        expectedVersion: 2,
        merchantPattern: 'Market',
        categoryId: id(2),
        confidence: 0.9,
        version: 3,
      },
    ],
    [
      'AdminVersionedMutation',
      {
        expectedVersion: 4,
        reason: 'Approved after policy review',
        approved: true,
        trainingPolicy: 'no_training',
        zdrCapable: true,
      },
    ],
    [
      'AssistantMessage',
      {
        id: id(3),
        conversationId: id(4),
        replyToMessageId: id(5),
        role: 'assistant',
        content: 'Your spending is within the selected budget.',
        status: 'completed',
        failureCode: null,
        snapshot: {
          id: id(6),
          schemaVersion: 1,
          evidenceRefs: [{ kind: 'budget', alias: 'BUDGET-1', version: 2 }],
          model: 'approved-model',
          provider: 'approved-provider',
          createdAt: at,
        },
        preview: null,
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

it('rejects unknown quota metadata and assistant message fields', () => {
  expect(
    validator('QuotaError')({
      code: 'AI_QUOTA_EXCEEDED',
      message: 'AI request quota is exhausted',
      requestId: 'ai-contract-instance',
      limit: 5,
      used: 5,
      resetsAt: at,
      provider: 'secret-provider',
    }),
  ).toBe(false);
  expect(
    validator('AssistantMessage')({
      id: id(3),
      conversationId: id(4),
      replyToMessageId: null,
      role: 'assistant',
      content: 'Safe answer',
      status: 'completed',
      failureCode: null,
      snapshot: null,
      preview: null,
      createdAt: at,
      rawPrompt: 'must not be public',
    }),
  ).toBe(false);
});
