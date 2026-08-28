import { validateEnvironment } from '../../../src/platform/config/environment.schema';

describe('backend entry points', () => {
  it('exports API, worker, and migration bootstraps', async () => {
    const [api, worker, migration] = await Promise.all([
      import('../../../src/main'),
      import('../../../src/worker'),
      import('../../../src/migration'),
    ]);

    expect(api.bootstrapApi).toBeInstanceOf(Function);
    expect(worker.bootstrapWorker).toBeInstanceOf(Function);
    expect(migration.runMigrations).toBeInstanceOf(Function);
  });

  it.each(['api', 'worker'] as const)(
    'rejects %s startup configuration before process work when the Clerk Admin secret is missing',
    (processKind) => {
      const environment = {
        ...process.env,
        NODE_ENV: 'test',
        MASARIFI_PROCESS_KIND: processKind,
        MASARIFI_RELEASE_VERSION: 'test-release',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:54322/test',
      };
      Reflect.deleteProperty(environment, 'MASARIFI_LIVE_DATABASE_TESTS');
      Reflect.deleteProperty(environment, 'CLERK_SECRET_KEY');

      expect(() => validateEnvironment(environment)).toThrow('CLERK_SECRET_KEY');
    },
  );

  it('keeps migration startup independent from provider and push secrets', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        MASARIFI_PROCESS_KIND: 'migration',
        MASARIFI_RELEASE_VERSION: 'test-release',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:54322/test',
      }),
    ).toMatchObject({ MASARIFI_PROCESS_KIND: 'migration' });
  });
});
