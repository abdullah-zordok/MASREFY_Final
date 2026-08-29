import { SchemaCompatibilityService } from '../../../src/platform/database/schema-compatibility';

describe('SchemaCompatibilityService', () => {
  it.each(['20260829080200', '20260829080300', '20260829090000'])(
    'accepts compatible additive schema version %s',
    async (version) => {
      const database = {
        query: jest.fn().mockResolvedValue({ rows: [{ version }] }),
      };
      const service = new SchemaCompatibilityService(database as never);

      await expect(service.check()).resolves.toBeUndefined();
    },
  );

  it.each([null, '20260829075000', 'malformed'])('fails closed for version %s', async (version) => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [{ version }] }),
    };
    const service = new SchemaCompatibilityService(database as never);

    await expect(service.check()).rejects.toThrow('SCHEMA_INCOMPATIBLE');
  });
});
