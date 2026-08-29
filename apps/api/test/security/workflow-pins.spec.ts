import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('backend workflow action pins', () => {
  const workflowPath = resolve(__dirname, '../../../../.github/workflows/backend-foundation.yml');

  it('pins every action to a full commit SHA', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const uses = workflow
      .split('\n')
      .filter((line) => line.includes('uses:'))
      .map((line) => /@([a-f0-9]+)\s*$/.exec(line)?.[1] ?? '');

    expect(uses.length).toBeGreaterThan(0);
    for (const reference of uses) expect(reference).toMatch(/^[a-f0-9]{40}$/);
  });

  it('grants the secret scanner read-only pull-request metadata access', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/permissions:\r?\n {2}contents: read\r?\n {2}pull-requests: read/);
  });

  it('blocks the image on database migrations and measured outbox budgets', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    for (const command of [
      'npm run supabase:start',
      'npm run db:reset',
      'npm run db:lint',
      'npm run test:db',
      'npm run start:migration',
      'npm run test:migration',
      'npm run test:database:integration',
      'npm run test:foundation:e2e',
      'npm run test:performance:platform',
      'npm run perf:seed:outbox',
      'npm run perf:explain:outbox',
      'npm run test:outbox:performance',
      'npm run test:stress',
    ]) {
      expect(workflow).toContain(command);
    }
    const loadIndex = workflow.indexOf('npm run test:outbox:performance');
    const stressIndex = workflow.indexOf('npm run test:stress');
    const stressSeedIndex = workflow.indexOf('npm run perf:seed:outbox', loadIndex);
    expect(stressSeedIndex).toBeGreaterThan(loadIndex);
    expect(stressSeedIndex).toBeLessThan(stressIndex);
    expect(workflow).toContain('needs: [secrets, sentinel-redaction, application, database]');
    expect(workflow).not.toMatch(/supabase\/tests\/.*(?:migration|db push)/i);
  });

  it('generates and verifies immutable release provenance and SBOM evidence', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain(
      'actions/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53',
    );
    expect(workflow).not.toContain('actions/attest@');
    expect(workflow.match(/cosign attest-blob/g)).toHaveLength(2);
    expect(workflow.match(/cosign verify-blob-attestation/g)).toHaveLength(2);
    expect(workflow).toContain('cosign verify-blob');
    expect(workflow).toContain(
      'sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6',
    );
    expect(workflow).toContain('cosign-release: v3.0.6');
    expect(workflow).not.toContain('attestations: write');
    expect(workflow).not.toContain('artifact-metadata: write');
  });
});
