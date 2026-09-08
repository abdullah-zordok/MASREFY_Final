import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

import { safeError } from '../../../src/platform/http/safe-exception.filter';
import { encodeBootstrapCursor, encodeSyncCursor } from '../../../src/sync/sync.codec';

type Parameter = {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema: object;
};

const document = load(
  readFileSync('specs/006-offline-sync-idempotency/contracts/openapi.yaml', 'utf8'),
) as {
  components: {
    parameters: Record<string, Parameter>;
    schemas: Record<string, unknown>;
  };
  paths: Record<string, { get?: { parameters?: ({ $ref: string } | Parameter)[] } }>;
};
const ajv = new Ajv({ strict: false });
addFormats(ajv);

function validator(name: string): ValidateFunction {
  return ajv.compile({
    $ref: `#/components/schemas/${name}`,
    components: document.components,
  });
}

function parameter(path: string, name: string): Parameter {
  const entry = document.paths[path]?.get?.parameters?.find((candidate) => {
    if ('$ref' in candidate) return candidate.$ref.endsWith(`/${name}`);
    return candidate.name === name;
  });
  if (!entry) throw new Error(`${path} ${name} parameter is missing`);
  if (!('$ref' in entry)) return entry;
  const referenced = document.components.parameters[entry.$ref.split('/').at(-1) ?? ''];
  if (!referenced) throw new Error(`${entry.$ref} is missing`);
  return referenced;
}

const key = Buffer.alloc(32, 7).toString('base64url');
const scope = {
  userId: 'user_123',
  deviceId: '10000000-0000-4000-8000-000000000001',
};
const syncCursor = encodeSyncCursor({ domain: 'accounts', position: 12n }, scope, key);
const bootstrapCursor = encodeBootstrapCursor(
  {
    domain: 'accounts',
    position: 12n,
    after: '20000000-0000-4000-8000-000000000001',
  },
  scope,
  key,
);

it('requires UUIDv4 device IDs at the sync boundary', () => {
  const deviceId = document.components.parameters.DeviceId;
  if (!deviceId) throw new Error('DeviceId parameter is missing');
  const validate = ajv.compile(deviceId.schema);
  expect(validate(scope.deviceId)).toBe(true);
  expect(validate('device-one')).toBe(false);
  expect(validate('10000000-0000-3000-8000-000000000001')).toBe(false);
});

it('documents bootstrap after/limit paging with signed-v2 cursors', () => {
  const after = parameter('/api/v1/sync/bootstrap', 'after');
  const limit = parameter('/api/v1/sync/bootstrap', 'limit');
  const validateAfter = ajv.compile({ ...after.schema, components: document.components });
  const validateLimit = ajv.compile({ ...limit.schema, components: document.components });

  expect(validateAfter(bootstrapCursor)).toBe(true);
  expect(validateAfter('opaque')).toBe(false);
  expect(validateLimit(500)).toBe(true);
  expect(validateLimit(501)).toBe(false);
  expect(after.description).toMatch(/signed-v2.*user.*device.*domain/i);
});

it('requires complete paged bootstrap and delta instances', () => {
  const bootstrap = {
    data: {
      domains: [
        {
          domain: 'accounts',
          cursor: syncCursor,
          items: [{ id: '20000000-0000-4000-8000-000000000001' }],
          hasMore: true,
          nextPage: bootstrapCursor,
        },
      ],
    },
    meta: { requestId: 'request-1' },
  };
  const delta = {
    data: {
      domain: 'accounts',
      changes: [],
      nextCursor: syncCursor,
      hasMore: false,
    },
    meta: { requestId: 'request-1' },
  };

  expect(validator('BootstrapResponse')(bootstrap)).toBe(true);
  expect(
    validator('BootstrapResponse')({
      ...bootstrap,
      data: {
        domains: bootstrap.data.domains.map(({ domain, cursor, items, nextPage }) => ({
          domain,
          cursor,
          items,
          nextPage,
        })),
      },
    }),
  ).toBe(false);
  expect(validator('DeltaResponse')(delta)).toBe(true);
  expect(
    validator('DeltaResponse')({
      ...delta,
      data: { ...delta.data, nextCursor: 'opaque' },
    }),
  ).toBe(false);
});

it('accepts the actual flat cursor-not-issued safe error', () => {
  const instance = safeError(409, 'request-1', [], 'SYNC_CURSOR_NOT_ISSUED');
  expect(instance).toEqual({
    code: 'SYNC_CURSOR_NOT_ISSUED',
    message: 'Sync cursor was not issued to this device',
    requestId: 'request-1',
  });
  const validate = validator('SyncError');
  expect({ valid: validate(instance), errors: validate.errors }).toEqual({
    valid: true,
    errors: null,
  });
});
