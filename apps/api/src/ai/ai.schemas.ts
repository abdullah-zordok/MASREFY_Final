const VOICE_KEYS = [
  'schemaVersion',
  'type',
  'amountMinor',
  'currency',
  'categoryId',
  'accountId',
  'date',
  'merchant',
  'note',
  'confidence',
] as const;

const ACTIONS = new Set([
  'transaction.create',
  'transaction.update',
  'budget.update',
  'savings_goal.create',
  'obligation.payment.record',
  'tracking.review.resolve',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ALIAS =
  /^(?:ACCOUNT|CATEGORY|TRANSACTION|BUDGET|OBLIGATION|SCHEDULE|REVIEW)-[1-9][0-9]{0,2}$/u;
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/u;
const DANGEROUS_INSTRUCTION =
  /\b(?:ignore\s+(?:all\s+)?(?:(?:previous|prior)\s+)?(?:instructions?|rules?)|call\s+(?:a\s+)?tool|(?:run|call|execute)\s+(?:internal\s+)?(?:sql|api)|select\s+(?:\*|[a-z_][\w.]*)\s+from|insert\s+into|delete\s+from|drop\s+table|alter\s+table|exec(?:ute)?\s+|curl\s+|fetch\s+)\b|(?:https?|file):\/\//iu;

export interface VoiceProposalOutput {
  schemaVersion: 1;
  type: 'transaction.create';
  amountMinor: string;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  date: string;
  merchant: string | null;
  note: string | null;
  confidence: number;
}

export interface AssistantOutput {
  schemaVersion: 1;
  answer: string;
  evidenceIds: string[];
  actionPreview: null | {
    schemaVersion: 1;
    actionType: string;
    payload: Record<string, unknown>;
    evidenceIds: string[];
  };
}

export interface VoiceWorkerOutput {
  schemaVersion: 1;
  transcript: string;
  language: 'ar' | 'en';
  confidence: number;
  proposal: VoiceProposalOutput;
}

export const VOICE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'transcript', 'language', 'confidence', 'proposal'],
  properties: {
    schemaVersion: { const: 1 },
    transcript: { type: 'string', maxLength: 8192 },
    language: { enum: ['ar', 'en'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    proposal: {
      type: 'object',
      additionalProperties: false,
      required: [...VOICE_KEYS],
      properties: {
        schemaVersion: { const: 1 },
        type: { const: 'transaction.create' },
        amountMinor: { type: 'string', pattern: '^-?[1-9][0-9]{0,15}$' },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        categoryId: {
          anyOf: [
            { type: 'null' },
            { type: 'string', pattern: '^(?:CATEGORY-[1-9][0-9]{0,2}|[0-9a-fA-F-]{36})$' },
          ],
        },
        accountId: { type: 'string', pattern: '^(?:ACCOUNT-[1-9][0-9]{0,2}|[0-9a-fA-F-]{36})$' },
        date: { type: 'string', format: 'date' },
        merchant: { type: ['string', 'null'], maxLength: 160 },
        note: { type: ['string', 'null'], maxLength: 500 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

const ID_SCHEMA = {
  type: 'string',
  pattern:
    '^(?:ACCOUNT|CATEGORY|TRANSACTION|BUDGET|OBLIGATION|SCHEDULE|REVIEW)-[1-9][0-9]{0,2}$|^[0-9a-fA-F-]{36}$',
};
const UUID_OR_NULL_SCHEMA = { anyOf: [ID_SCHEMA, { type: 'null' }] };
const VERSION_SCHEMA = { type: 'integer', minimum: 1 };
const MONEY_SCHEMA = { type: 'string', pattern: '^[1-9][0-9]{0,15}$' };
const NULLABLE_TEXT_SCHEMA = (maximum: number) => ({
  type: ['string', 'null'],
  maxLength: maximum,
});
const EVIDENCE_SCHEMA = {
  type: 'array',
  maxItems: 32,
  uniqueItems: true,
  items: { type: 'string', pattern: '^[A-Z][A-Z0-9_-]{0,63}$' },
};
const previewSchema = (
  actionType: string,
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'actionType', 'payload', 'evidenceIds'],
  properties: {
    schemaVersion: { const: 1 },
    actionType: { const: actionType },
    payload: { type: 'object', additionalProperties: false, required, properties },
    evidenceIds: EVIDENCE_SCHEMA,
  },
});
const ACTION_PREVIEW_SCHEMAS = [
  previewSchema(
    'transaction.create',
    {
      amountMinor: { type: 'string', pattern: '^-?[1-9][0-9]{0,15}$' },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      accountId: ID_SCHEMA,
      categoryId: UUID_OR_NULL_SCHEMA,
      date: { type: 'string', format: 'date' },
      merchant: NULLABLE_TEXT_SCHEMA(160),
      note: NULLABLE_TEXT_SCHEMA(500),
    },
    ['amountMinor', 'currency', 'accountId', 'categoryId', 'date', 'merchant', 'note'],
  ),
  previewSchema(
    'transaction.update',
    {
      transactionId: ID_SCHEMA,
      expectedVersion: VERSION_SCHEMA,
      reason: { type: 'string', minLength: 1, maxLength: 500 },
      amountMinor: { type: 'integer', minimum: 1 },
      accountId: ID_SCHEMA,
      categoryId: UUID_OR_NULL_SCHEMA,
      title: { type: 'string', minLength: 1, maxLength: 160 },
      merchant: NULLABLE_TEXT_SCHEMA(160),
      paymentMethod: NULLABLE_TEXT_SCHEMA(80),
      note: NULLABLE_TEXT_SCHEMA(500),
      occurredAt: { type: 'string', format: 'date-time' },
    },
    ['transactionId', 'expectedVersion', 'reason'],
  ),
  previewSchema(
    'budget.update',
    {
      budgetId: ID_SCHEMA,
      expectedVersion: VERSION_SCHEMA,
      patch: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          periodStart: { type: 'string', format: 'date' },
          periodEnd: { type: 'string', format: 'date' },
          totalMinor: { type: 'string', pattern: '^[0-9]{1,16}$' },
          incomeTargetMinor: { type: 'string', pattern: '^[0-9]{1,16}$' },
          savingsTargetMinor: { type: 'string', pattern: '^[0-9]{1,16}$' },
          rolloverEnabled: { type: 'boolean' },
          rolloverMinor: { type: 'string', pattern: '^[0-9]{1,16}$' },
          status: { enum: ['draft', 'active', 'paused', 'closed', 'deleted'] },
        },
      },
    },
    ['budgetId', 'expectedVersion', 'patch'],
  ),
  previewSchema(
    'savings_goal.create',
    {
      name: { type: 'string', minLength: 1, maxLength: 160 },
      targetMinor: MONEY_SCHEMA,
      openingTrackedMinor: { type: 'string', pattern: '^[0-9]{1,16}$' },
      currencyCode: { type: 'string', pattern: '^[A-Z]{3}$' },
      targetDate: { type: ['string', 'null'], format: 'date' },
      linkedAccountId: UUID_OR_NULL_SCHEMA,
      iconKey: NULLABLE_TEXT_SCHEMA(80),
      emergencyFund: { type: 'boolean' },
    },
    ['name', 'targetMinor', 'currencyCode'],
  ),
  previewSchema(
    'obligation.payment.record',
    {
      obligationId: ID_SCHEMA,
      transactionId: ID_SCHEMA,
      expectedVersion: VERSION_SCHEMA,
      paymentMethod: NULLABLE_TEXT_SCHEMA(80),
      paymentCase: { enum: ['partial', 'full', 'over', 'early', 'settlement', 'correction'] },
      allocationIntent: {
        enum: [
          'current',
          'later_installments',
          'principal',
          'correction',
          'settlement',
          'prepayment',
        ],
      },
      source: { enum: ['manual', 'automatic', 'voice', 'platform_assisted'] },
      allocations: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['scheduleItemId', 'amountMinor'],
          properties: { scheduleItemId: ID_SCHEMA, amountMinor: MONEY_SCHEMA },
        },
      },
    },
    [
      'obligationId',
      'transactionId',
      'expectedVersion',
      'paymentMethod',
      'paymentCase',
      'allocationIntent',
      'source',
      'allocations',
    ],
  ),
  previewSchema(
    'tracking.review.resolve',
    {
      reviewId: ID_SCHEMA,
      decision: { enum: ['accept', 'reject', 'edit_accept'] },
      expectedVersion: VERSION_SCHEMA,
      edit: {
        type: 'object',
        additionalProperties: false,
        properties: {
          amountMinor: { type: 'integer', minimum: 1 },
          currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          accountId: ID_SCHEMA,
          categoryId: UUID_OR_NULL_SCHEMA,
          title: { type: 'string', minLength: 1, maxLength: 160 },
          merchant: NULLABLE_TEXT_SCHEMA(160),
          paymentMethod: NULLABLE_TEXT_SCHEMA(80),
          note: NULLABLE_TEXT_SCHEMA(500),
          occurredAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    ['reviewId', 'decision', 'expectedVersion', 'edit'],
  ),
] as const;

export const ASSISTANT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'answer', 'evidenceIds', 'actionPreview'],
  properties: {
    schemaVersion: { const: 1 },
    answer: { type: 'string', maxLength: 16384 },
    evidenceIds: {
      type: 'array',
      maxItems: 32,
      uniqueItems: true,
      items: { type: 'string', pattern: '^[A-Z][A-Z0-9_-]{0,63}$' },
    },
    actionPreview: {
      anyOf: [{ type: 'null' }, ...ACTION_PREVIEW_SCHEMAS],
    },
  },
} as const;

function invalid(): never {
  throw new Error('AI_SCHEMA_INVALID');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid();
  }
}

function closedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): void {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !(key in value))
  )
    invalid();
}

function identifier(value: unknown, aliases: boolean): value is string {
  return typeof value === 'string' && (UUID.test(value) || (aliases && ALIAS.test(value)));
}

function optionalIdentifier(value: unknown, aliases: boolean): value is string | null {
  return value === null || identifier(value, aliases);
}

function nullableBounded(value: unknown, maximum: number): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && Array.from(value).length <= maximum && !hasControl(value))
  );
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return (
      point <= 8 || point === 11 || point === 12 || (point >= 14 && point <= 31) || point === 127
    );
  });
}

function parseVoiceProposalValue(input: unknown, aliases: boolean): VoiceProposalOutput {
  const value = object(input);
  exactKeys(value, VOICE_KEYS);
  if (
    value.schemaVersion !== 1 ||
    value.type !== 'transaction.create' ||
    typeof value.amountMinor !== 'string' ||
    !/^-?[1-9][0-9]{0,15}$/.test(value.amountMinor) ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !optionalIdentifier(value.categoryId, aliases) ||
    !identifier(value.accountId, aliases) ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    !nullableBounded(value.merchant, 160) ||
    !nullableBounded(value.note, 500) ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    invalid();
  }
  return value as unknown as VoiceProposalOutput;
}

export function parseVoiceProposal(input: unknown): VoiceProposalOutput {
  return parseVoiceProposalValue(input, false);
}

export function parseVoiceWorkerOutput(input: unknown): VoiceWorkerOutput {
  const value = object(input);
  exactKeys(value, ['schemaVersion', 'transcript', 'language', 'confidence', 'proposal']);
  if (
    value.schemaVersion !== 1 ||
    typeof value.transcript !== 'string' ||
    new TextEncoder().encode(value.transcript).length > 8192 ||
    !['ar', 'en'].includes(String(value.language)) ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  )
    invalid();
  return { ...value, proposal: parseVoiceProposalValue(value.proposal, true) } as VoiceWorkerOutput;
}

function evidenceIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    new Set(value).size === value.length &&
    value.every((item) => typeof item === 'string' && /^[A-Z][A-Z0-9_-]{0,63}$/.test(item))
  );
}

function positiveVersion(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function minor(value: unknown, positive = false): boolean {
  return (
    typeof value === 'string' &&
    (positive ? /^[1-9][0-9]{0,15}$/ : /^-?[1-9][0-9]{0,15}$/).test(value)
  );
}

function boundedText(value: unknown, maximum: number, nullable = false): boolean {
  return (
    (nullable && value === null) ||
    (typeof value === 'string' &&
      value.trim() === value &&
      value.length > 0 &&
      value.length <= maximum &&
      !hasControl(value))
  );
}

function date(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function actionPayload(action: string, input: unknown, aliases: boolean): void {
  const value = object(input);
  if (hasForbiddenKey(value) || new TextEncoder().encode(JSON.stringify(value)).length > 8_192)
    invalid();
  if (action === 'transaction.create') {
    closedKeys(
      value,
      ['amountMinor', 'currency', 'accountId', 'categoryId', 'date', 'merchant', 'note'],
      ['amountMinor', 'currency', 'accountId', 'categoryId', 'date', 'merchant', 'note'],
    );
    if (
      !minor(value.amountMinor) ||
      typeof value.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(value.currency) ||
      !identifier(value.accountId, aliases) ||
      !optionalIdentifier(value.categoryId, aliases) ||
      !date(value.date) ||
      !nullableBounded(value.merchant, 160) ||
      !nullableBounded(value.note, 500)
    )
      invalid();
    return;
  }
  if (action === 'transaction.update') {
    const patch = [
      'amountMinor',
      'accountId',
      'categoryId',
      'title',
      'merchant',
      'paymentMethod',
      'note',
      'occurredAt',
    ];
    closedKeys(
      value,
      ['transactionId', 'expectedVersion', 'reason', ...patch],
      ['transactionId', 'expectedVersion', 'reason'],
    );
    if (
      !patch.some((key) => key in value) ||
      !identifier(value.transactionId, aliases) ||
      !positiveVersion(value.expectedVersion) ||
      !boundedText(value.reason, 500) ||
      ('amountMinor' in value &&
        (typeof value.amountMinor !== 'number' ||
          !Number.isSafeInteger(value.amountMinor) ||
          value.amountMinor < 1)) ||
      ('accountId' in value && !identifier(value.accountId, aliases)) ||
      ('categoryId' in value && !optionalIdentifier(value.categoryId, aliases)) ||
      ('title' in value && !boundedText(value.title, 160)) ||
      ['merchant', 'paymentMethod', 'note'].some(
        (key) =>
          key in value &&
          !boundedText(
            value[key],
            key === 'paymentMethod' ? 80 : key === 'merchant' ? 160 : 500,
            true,
          ),
      ) ||
      ('occurredAt' in value &&
        (typeof value.occurredAt !== 'string' || Number.isNaN(Date.parse(value.occurredAt))))
    )
      invalid();
    return;
  }
  if (action === 'budget.update') {
    closedKeys(
      value,
      ['budgetId', 'expectedVersion', 'patch'],
      ['budgetId', 'expectedVersion', 'patch'],
    );
    const patch = object(value.patch);
    const allowed = [
      'name',
      'periodStart',
      'periodEnd',
      'totalMinor',
      'incomeTargetMinor',
      'savingsTargetMinor',
      'rolloverEnabled',
      'rolloverMinor',
      'status',
    ];
    closedKeys(patch, allowed, []);
    if (
      Object.keys(patch).length === 0 ||
      !identifier(value.budgetId, aliases) ||
      !positiveVersion(value.expectedVersion) ||
      ('name' in patch && !boundedText(patch.name, 120)) ||
      ['periodStart', 'periodEnd'].some((key) => key in patch && !date(patch[key])) ||
      ['totalMinor', 'incomeTargetMinor', 'savingsTargetMinor', 'rolloverMinor'].some((key) => {
        const amount = patch[key];
        return key in patch && (typeof amount !== 'string' || !/^[0-9]{1,16}$/.test(amount));
      }) ||
      ('rolloverEnabled' in patch && typeof patch.rolloverEnabled !== 'boolean') ||
      ('status' in patch &&
        !['draft', 'active', 'paused', 'closed', 'deleted'].includes(String(patch.status)))
    )
      invalid();
    return;
  }
  if (action === 'savings_goal.create') {
    closedKeys(
      value,
      [
        'name',
        'targetMinor',
        'openingTrackedMinor',
        'currencyCode',
        'targetDate',
        'linkedAccountId',
        'iconKey',
        'emergencyFund',
      ],
      ['name', 'targetMinor', 'currencyCode'],
    );
    if (
      !boundedText(value.name, 160) ||
      !minor(value.targetMinor, true) ||
      typeof value.currencyCode !== 'string' ||
      !/^[A-Z]{3}$/.test(value.currencyCode) ||
      ('openingTrackedMinor' in value &&
        (typeof value.openingTrackedMinor !== 'string' ||
          !/^[0-9]{1,16}$/.test(value.openingTrackedMinor))) ||
      ('targetDate' in value && value.targetDate !== null && !date(value.targetDate)) ||
      ('linkedAccountId' in value &&
        value.linkedAccountId !== null &&
        !identifier(value.linkedAccountId, aliases)) ||
      ('iconKey' in value &&
        value.iconKey !== null &&
        (typeof value.iconKey !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(value.iconKey))) ||
      ('emergencyFund' in value && typeof value.emergencyFund !== 'boolean')
    )
      invalid();
    return;
  }
  if (action === 'obligation.payment.record') {
    closedKeys(
      value,
      [
        'obligationId',
        'transactionId',
        'expectedVersion',
        'paymentMethod',
        'paymentCase',
        'allocationIntent',
        'source',
        'allocations',
      ],
      [
        'obligationId',
        'transactionId',
        'expectedVersion',
        'paymentMethod',
        'paymentCase',
        'allocationIntent',
        'source',
        'allocations',
      ],
    );
    if (
      !identifier(value.obligationId, aliases) ||
      !identifier(value.transactionId, aliases) ||
      !positiveVersion(value.expectedVersion) ||
      !boundedText(value.paymentMethod, 80, true) ||
      !['partial', 'full', 'over', 'early', 'settlement', 'correction'].includes(
        String(value.paymentCase),
      ) ||
      ![
        'current',
        'later_installments',
        'principal',
        'correction',
        'settlement',
        'prepayment',
      ].includes(String(value.allocationIntent)) ||
      !['manual', 'automatic', 'voice', 'platform_assisted'].includes(String(value.source)) ||
      !Array.isArray(value.allocations) ||
      value.allocations.length < 1 ||
      value.allocations.length > 100 ||
      value.allocations.some((item) => {
        const allocation = object(item);
        closedKeys(
          allocation,
          ['scheduleItemId', 'amountMinor'],
          ['scheduleItemId', 'amountMinor'],
        );
        return (
          !identifier(allocation.scheduleItemId, aliases) || !minor(allocation.amountMinor, true)
        );
      })
    )
      invalid();
    return;
  }
  if (action === 'tracking.review.resolve') {
    closedKeys(
      value,
      ['reviewId', 'decision', 'expectedVersion', 'edit'],
      ['reviewId', 'decision', 'expectedVersion', 'edit'],
    );
    const edit = object(value.edit);
    const allowed = [
      'amountMinor',
      'currency',
      'accountId',
      'categoryId',
      'title',
      'merchant',
      'paymentMethod',
      'note',
      'occurredAt',
    ];
    closedKeys(edit, allowed, []);
    if (
      !identifier(value.reviewId, aliases) ||
      !positiveVersion(value.expectedVersion) ||
      !['accept', 'reject', 'edit_accept'].includes(String(value.decision)) ||
      (value.decision === 'edit_accept') !== Object.keys(edit).length > 0
    )
      invalid();
    return;
  }
  invalid();
}

function parseAssistantOutputValue(input: unknown, aliases: boolean): AssistantOutput {
  const value = object(input);
  exactKeys(value, ['schemaVersion', 'answer', 'evidenceIds', 'actionPreview']);
  if (
    value.schemaVersion !== 1 ||
    typeof value.answer !== 'string' ||
    new TextEncoder().encode(value.answer).length > 16_384 ||
    !evidenceIds(value.evidenceIds)
  ) {
    invalid();
  }
  if (value.actionPreview !== null) {
    const preview = object(value.actionPreview);
    exactKeys(preview, ['schemaVersion', 'actionType', 'payload', 'evidenceIds']);
    if (
      preview.schemaVersion !== 1 ||
      typeof preview.actionType !== 'string' ||
      !ACTIONS.has(preview.actionType) ||
      !evidenceIds(preview.evidenceIds) ||
      !preview.payload ||
      typeof preview.payload !== 'object' ||
      Array.isArray(preview.payload)
    ) {
      invalid();
    }
    actionPayload(preview.actionType, preview.payload, aliases);
  }
  return value as unknown as AssistantOutput;
}

export function parseAssistantOutput(input: unknown): AssistantOutput {
  return parseAssistantOutputValue(input, false);
}

export function parseAssistantWorkerOutput(input: unknown): AssistantOutput {
  return parseAssistantOutputValue(input, true);
}

export function assertSafeAiInput(value: string, maximumBytes = 8_192): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length === 0 ||
    new TextEncoder().encode(normalized).length > maximumBytes ||
    hasControl(normalized) ||
    BIDI_CONTROLS.test(normalized) ||
    DANGEROUS_INSTRUCTION.test(normalized)
  ) {
    throw new Error('AI_INPUT_REJECTED');
  }
  return normalized;
}

export function redactAiText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/(?:\d[ -]?){13,19}/gu, '[redacted-number]');
}

export function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) =>
      /^(?:tool|tools|sql|url|callback|authorization|secret|apiKey|storageRef|raw)$/iu.test(key) ||
      hasForbiddenKey(child),
  );
}
