import { SchemaCompatibilityService } from '../../../src/platform/database/schema-compatibility';

describe('SchemaCompatibilityService', () => {
  it('accepts the exact application migration range', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [{ version: '20260827001300' }] }),
    };
    const service = new SchemaCompatibilityService(database as never);

    await expect(service.check()).resolves.toBeUndefined();
  });

  it.each([null, '20260827000300', '20260828000100'])(
    'fails closed for version %s',
    async (version) => {
      const database = {
        query: jest.fn().mockResolvedValue({ rows: [{ version }] }),
      };
      const service = new SchemaCompatibilityService(database as never);

      await expect(service.check()).rejects.toThrow('SCHEMA_INCOMPATIBLE');
    },
  );
});
