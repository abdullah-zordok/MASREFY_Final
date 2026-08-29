import { Injectable } from '@nestjs/common';

import { PoolService } from './pool.service';

export const MINIMUM_SCHEMA_VERSION = '20260829080200';

@Injectable()
export class SchemaCompatibilityService {
  constructor(private readonly database: PoolService) {}

  async check(timeoutMs = 1_000): Promise<void> {
    const result = await this.database.query<{ version: string | null }>(
      'select max(version)::text as version from supabase_migrations.schema_migrations',
      [],
      timeoutMs,
    );
    const version = result.rows[0]?.version;
    if (
      version === null ||
      version === undefined ||
      !/^\d{14}$/.test(version) ||
      version < MINIMUM_SCHEMA_VERSION
    ) {
      throw new Error('SCHEMA_INCOMPATIBLE');
    }
  }
}
