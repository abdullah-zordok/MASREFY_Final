import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import {
  DependencyChecksDto,
  FieldErrorDto,
  LivenessResponseDto,
  ReadinessFailureDto,
  ReadinessSuccessDto,
  SafeErrorDto,
} from './platform-contract.dto';
import { MetaResponseDto } from '../meta/meta.dto';

const schemaNames = [
  'LivenessResponse',
  'DependencyChecks',
  'ReadinessSuccess',
  'ReadinessFailure',
  'MetaResponse',
  'FieldError',
  'SafeError',
  'Profile',
  'ProfileUpdate',
  'PrivacySettings',
  'Preferences',
  'PreferencesReplace',
  'OnboardingProgress',
  'OnboardingReplace',
  'Device',
  'DevicePage',
  'DeviceRegistration',
  'DeviceRegistrationResult',
];

const operationMethods = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head']);

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description' && key !== 'summary')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, comparable(child)]),
  );
}

function sameContract(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

function mergeCompatible(left: unknown, right: unknown, label: string): unknown {
  if (left === undefined) return structuredClone(right);
  if (right === undefined || sameContract(left, right)) return left;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    throw new Error(`OpenAPI contract conflict: ${label}`);
  }
  const merged = structuredClone(left) as Record<string, unknown>;
  for (const key of Object.keys(right).sort()) {
    if (key === 'description' || key === 'summary') continue;
    merged[key] = mergeCompatible(merged[key], Reflect.get(right, key), label);
  }
  return merged;
}

function mergeNamed(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  category: string,
): void {
  for (const name of Object.keys(source).sort()) {
    if (category === 'schemas' && target[name] !== undefined) {
      const current = target[name] as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
      const approved = source[name] as { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
      const currentProperties = Object.keys(current.properties ?? {}).sort();
      const approvedProperties = Object.keys(approved.properties ?? {}).sort();
      const currentRequired = [...(current.required ?? [])].sort();
      const approvedRequired = [...(approved.required ?? [])].sort();
      if (
        JSON.stringify(currentProperties) !== JSON.stringify(approvedProperties) ||
        JSON.stringify(currentRequired) !== JSON.stringify(approvedRequired) ||
        current.additionalProperties !== approved.additionalProperties
      ) {
        throw new Error(`OpenAPI contract conflict: ${category} ${name}`);
      }
      target[name] = structuredClone(source[name]);
      continue;
    }
    target[name] = mergeCompatible(target[name], source[name], `${category} ${name}`);
  }
}

function composeFragments(document: OpenAPIObject, fragments: readonly Record<string, unknown>[]): void {
  const operationIds = new Set<string>();
  for (const path of Object.values(document.paths) as Record<string, unknown>[]) {
    for (const [method, operation] of Object.entries(path)) {
      if (!operationMethods.has(method) || typeof operation !== 'object' || operation === null) continue;
      const operationId = (operation as Record<string, unknown>).operationId;
      if (typeof operationId === 'string') operationIds.add(operationId);
    }
  }

  for (const fragment of fragments) {
    const paths = fragment.paths as Record<string, Record<string, unknown>> | undefined;
    for (const pathName of Object.keys(paths ?? {}).sort()) {
      const incoming = paths?.[pathName] ?? {};
      const existing = (document.paths[pathName] ??= {}) as Record<string, unknown>;
      for (const key of Object.keys(incoming).sort()) {
        const value = incoming[key];
        if (key in existing) {
          const current = existing[key];
          const currentId = typeof current === 'object' && current !== null
            ? (current as Record<string, unknown>).operationId
            : undefined;
          const incomingId = typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>).operationId
            : undefined;
          if (!operationMethods.has(key) || currentId !== incomingId || typeof incomingId !== 'string') {
            throw new Error(`OpenAPI path operation conflict: ${pathName} ${key}`);
          }
          existing[key] = structuredClone(value);
          continue;
        }
        if (operationMethods.has(key) && typeof value === 'object' && value !== null) {
          const operationId = (value as Record<string, unknown>).operationId;
          if (typeof operationId === 'string' && operationIds.has(operationId)) {
            throw new Error(`OpenAPI operationId conflict: ${operationId}`);
          }
          if (typeof operationId === 'string') operationIds.add(operationId);
        }
        existing[key] = structuredClone(value);
      }
    }

    const components = fragment.components as Record<string, Record<string, unknown>> | undefined;
    if (components) {
      document.components ??= {};
      const target = document.components as unknown as Record<string, Record<string, unknown>>;
      for (const category of Object.keys(components).sort()) {
        const source = components[category];
        if (!source) continue;
        target[category] ??= {};
        mergeNamed(target[category], source, category);
      }
    }

    const tags = fragment.tags as Array<Record<string, unknown>> | undefined;
    for (const tag of tags ?? []) {
      const name = tag.name;
      if (typeof name !== 'string') continue;
      const existing = document.tags?.find((candidate) => candidate.name === name);
      if (existing) mergeCompatible(existing, tag, `tag ${name}`);
      if (!existing) (document.tags ??= []).push(structuredClone(tag) as { name: string });
    }
  }
}

export function generateOpenApi(
  app: INestApplication,
  approvedFragments: readonly Record<string, unknown>[] = [],
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Masarifi Backend Foundation API')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'ClerkBearer')
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      LivenessResponseDto,
      DependencyChecksDto,
      ReadinessSuccessDto,
      ReadinessFailureDto,
      MetaResponseDto,
      FieldErrorDto,
      SafeErrorDto,
    ],
  });
  for (const name of schemaNames) {
    const schema = document.components?.schemas?.[name];
    if (schema && typeof schema === 'object' && !('$ref' in schema))
      schema.additionalProperties = false;
  }
  document.openapi = '3.1.0';
  composeFragments(document, approvedFragments);
  return document;
}
