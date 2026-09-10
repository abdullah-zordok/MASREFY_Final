import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

const document = load(
  readFileSync('specs/013-performance-caching-observability-operations/contracts/openapi.yaml', 'utf8'),
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

const incidentId = '13000000-0000-4000-8000-000000000001';
const at = '2026-09-10T08:00:00.000Z';

it('accepts exact incident status, severity, resource, and update instances', () => {
  const instances: [string, unknown][] = [
    ['OperationsIncidentStatus', 'monitoring'],
    ['OperationsIncidentSeverity', 'warning'],
    [
      'OperationsIncident',
      {
        id: incidentId,
        title: 'Provider latency under review',
        severity: 'warning',
        status: 'monitoring',
        startedAt: at,
        resolvedAt: null,
        publicSummary: 'The provider has recovered and remains under observation.',
        assignedAdminId: null,
        version: 3,
      },
    ],
    [
      'UpdateIncidentRequest',
      {
        expectedVersion: 3,
        reason: 'Move the recovered incident into monitored state.',
        status: 'monitoring',
        severity: 'warning',
        publicSummary: 'The provider has recovered and remains under observation.',
        assignedAdminId: null,
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

it('rejects drifted incident states, severities, and update fields', () => {
  expect(validator('OperationsIncidentStatus')('closed')).toBe(false);
  expect(validator('OperationsIncidentSeverity')('high')).toBe(false);
  expect(
    validator('UpdateIncidentRequest')({
      expectedVersion: 3,
      reason: 'Unknown incident fields must remain closed.',
      status: 'monitoring',
      internalNotes: 'must not cross the boundary',
    }),
  ).toBe(false);
});

it('accepts exact closed setting, flag, and maintenance update instances', () => {
  const instances: [string, unknown][] = [
    [
      'UpdateSettingRequest',
      { value: { minimumDays: 30, maximumDays: 365 }, expectedVersion: 2, reason: 'Keep the retention window bounded.' },
    ],
    [
      'UpdateFlagRequest',
      {
        defaultEnabled: false,
        rules: [{ priority: 800, audience: { cohort: 'percent-00' }, enabled: true }],
        expectedVersion: 2,
        reason: 'Advance one deterministic cohort safely.',
      },
    ],
    [
      'UpdateMaintenanceRequest',
      {
        status: 'active',
        expectedVersion: 2,
        reason: 'Activate the reviewed maintenance window.',
      },
    ],
  ];

  for (const [schema, instance] of instances) {
    const validate = validator(schema);
    expect({ schema, valid: validate(instance), errors: validate.errors }).toEqual({ schema, valid: true, errors: null });
  }
});
