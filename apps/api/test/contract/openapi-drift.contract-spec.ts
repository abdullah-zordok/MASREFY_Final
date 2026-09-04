import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../src/app.module';
import { generateOpenApi } from '../../src/platform/http/openapi';

type Schema = {
  required?: string[];
  properties?: Record<string, unknown>;
  additionalProperties?: unknown;
};
type Contract = {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        responses?: Record<string, unknown>;
        security?: unknown;
      }
    >
  >;
  components?: {
    schemas?: Record<string, Schema>;
    securitySchemes?: Record<string, unknown>;
  };
};

type ContractSurface = {
  paths: Record<string, unknown>;
  schemas: Record<string, unknown>;
};

function contractSurface(contract: Contract): ContractSurface {
  const paths = Object.fromEntries(
    Object.entries(contract.paths).map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods)
          .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map(([method, operation]) => [
            method,
            {
              operationId: operation.operationId,
              responses: Object.keys(operation.responses ?? {}).sort(),
              secured: Array.isArray(operation.security) && operation.security.length > 0,
            },
          ]),
      ),
    ]),
  );
  const schemas = Object.fromEntries(
    Object.entries(contract.components?.schemas ?? {}).map(([name, schema]) => [
      name,
      {
        additionalProperties: schema.additionalProperties,
        required: [...(schema.required ?? [])].sort(),
        properties: Object.keys(schema.properties ?? {}).sort(),
      },
    ]),
  );
  return { paths, schemas };
}

function loadContract(path: string): Contract {
  return load(readFileSync(resolve(__dirname, path), 'utf8')) as Contract;
}

describe('OpenAPI drift', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('matches the combined approved endpoint and schema surface', () => {
    const foundation = loadContract('../../specs/001-backend-foundation/contracts/openapi.yaml');
    const identity = loadContract(
      '../../specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml',
    );
    const security = loadContract('../../specs/003-admin-rbac-security/contracts/openapi.yaml');
    const reference = loadContract(
      '../../specs/004-reference-data-categories-accounts/contracts/openapi.yaml',
    );
    const ledger = loadContract(
      '../../specs/005-transactions-ledger-integrity/contracts/openapi.yaml',
    );
    const sync = loadContract('../../specs/006-offline-sync-idempotency/contracts/openapi.yaml');
    const planning = loadContract('../../specs/007-financial-planning/contracts/openapi.yaml');
    const tracking = loadContract(
      '../../specs/008-tracking-imports-deduplication/contracts/openapi.yaml',
    );
    const ai = loadContract(
      '../../specs/009-voice-openrouter-financial-assistant/contracts/openapi.yaml',
    );
    const reports = loadContract(
      '../../specs/010-reports-analytics-exports-email/contracts/openapi.yaml',
    );
    const generated = generateOpenApi(app, [
      identity,
      security,
      reference,
      ledger,
      sync,
      planning,
      tracking,
      ai,
      reports,
    ]) as unknown as Contract;

    expect(contractSurface(generated)).toEqual({
      paths: {
        ...contractSurface(foundation).paths,
        ...contractSurface(identity).paths,
        ...contractSurface(security).paths,
        ...contractSurface(reference).paths,
        ...contractSurface(ledger).paths,
        ...contractSurface(sync).paths,
        ...contractSurface(planning).paths,
        ...contractSurface(tracking).paths,
        ...contractSurface(ai).paths,
        ...contractSurface(reports).paths,
      },
      schemas: {
        ...contractSurface(foundation).schemas,
        ...contractSurface(identity).schemas,
        ...contractSurface(security).schemas,
        ...contractSurface(reference).schemas,
        ...contractSurface(ledger).schemas,
        ...contractSurface(sync).schemas,
        ...contractSurface(planning).schemas,
        ...contractSurface(tracking).schemas,
        ...contractSurface(ai).schemas,
        ...contractSurface(reports).schemas,
      },
    });
  });

  it('composes the approved identity fragment with the foundation contract', () => {
    const foundation = loadContract('../../specs/001-backend-foundation/contracts/openapi.yaml');
    const identity = loadContract(
      '../../specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml',
    );
    const security = loadContract('../../specs/003-admin-rbac-security/contracts/openapi.yaml');
    const reference = loadContract(
      '../../specs/004-reference-data-categories-accounts/contracts/openapi.yaml',
    );
    const ledger = loadContract(
      '../../specs/005-transactions-ledger-integrity/contracts/openapi.yaml',
    );
    const sync = loadContract('../../specs/006-offline-sync-idempotency/contracts/openapi.yaml');
    const planning = loadContract('../../specs/007-financial-planning/contracts/openapi.yaml');
    const tracking = loadContract(
      '../../specs/008-tracking-imports-deduplication/contracts/openapi.yaml',
    );
    const ai = loadContract(
      '../../specs/009-voice-openrouter-financial-assistant/contracts/openapi.yaml',
    );
    const reports = loadContract(
      '../../specs/010-reports-analytics-exports-email/contracts/openapi.yaml',
    );
    const generateWithFragments = generateOpenApi as unknown as (
      target: INestApplication,
      fragments: Contract[],
    ) => Contract;
    const generated = generateWithFragments(app, [
      identity,
      security,
      reference,
      ledger,
      sync,
      planning,
      tracking,
      ai,
      reports,
    ]);
    const foundationSurface = contractSurface(foundation);
    const identitySurface = contractSurface(identity);
    const securitySurface = contractSurface(security);
    const referenceSurface = contractSurface(reference);
    const ledgerSurface = contractSurface(ledger);
    const syncSurface = contractSurface(sync);
    const planningSurface = contractSurface(planning);
    const trackingSurface = contractSurface(tracking);
    const aiSurface = contractSurface(ai);
    const reportsSurface = contractSurface(reports);

    expect(contractSurface(generated)).toEqual({
      paths: {
        ...foundationSurface.paths,
        ...identitySurface.paths,
        ...securitySurface.paths,
        ...referenceSurface.paths,
        ...ledgerSurface.paths,
        ...syncSurface.paths,
        ...planningSurface.paths,
        ...trackingSurface.paths,
        ...aiSurface.paths,
        ...reportsSurface.paths,
      },
      schemas: {
        ...foundationSurface.schemas,
        ...identitySurface.schemas,
        ...securitySurface.schemas,
        ...referenceSurface.schemas,
        ...ledgerSurface.schemas,
        ...syncSurface.schemas,
        ...planningSurface.schemas,
        ...trackingSurface.schemas,
        ...aiSurface.schemas,
        ...reportsSurface.schemas,
      },
    });
    expect(
      Object.values(generated.paths).flatMap((path) =>
        Object.values(path).map((operation) => operation.operationId),
      ),
    ).toEqual(
      expect.arrayContaining([
        'getMyProfile',
        'updateMyProfile',
        'getMyPreferences',
        'replaceMyPreferences',
        'getMyOnboardingProgress',
        'replaceMyOnboardingProgress',
        'listMyDevices',
        'registerMyDevice',
        'revokeMyDevice',
        'receiveClerkWebhook',
        'listAdmins',
        'createMyPrivacyExport',
        'createMyDeletionRequest',
        'submitSyncMutations',
        'getSyncDelta',
        'getPlanningSummary',
        'getAdminPlanningSummary',
        'createImport',
        'decideTrackingReview',
        'decideDuplicateCandidate',
        'publishParserVersion',
        'createReport',
        'createAdminExport',
      ]),
    );
  });

  it('rejects conflicting schemas, security schemes, and operation IDs', () => {
    const generateWithFragments = generateOpenApi as unknown as (
      target: INestApplication,
      fragments: Contract[],
    ) => Contract;

    expect(() =>
      generateWithFragments(app, [
        { paths: {}, components: { schemas: { SafeError: { required: ['leak'] } } } },
      ]),
    ).toThrow(/SafeError/);
    expect(() =>
      generateWithFragments(app, [
        {
          paths: {},
          components: { securitySchemes: { ClerkBearer: { type: 'apiKey' } } },
        },
      ]),
    ).toThrow(/ClerkBearer/);
    expect(() =>
      generateWithFragments(app, [
        {
          paths: {
            '/duplicate-operation': {
              get: { operationId: 'getLiveness', responses: {}, security: [] },
            },
          },
        },
      ]),
    ).toThrow(/getLiveness/);
  });
});
