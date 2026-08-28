import { Injectable } from '@nestjs/common';

import { PoolService } from './pool.service';

export const REQUIRED_SCHEMA_VERSION = '20260827001300';

@Injectable()
export class SchemaCompatibilityService {
  constructor(private readonly database: PoolService) {}

  async check(timeoutMs = 1_000): Promise<void> {
    const result = await this.database.query<{ version: string | null }>(
      'select max(version)::text as version from supabase_migrations.schema_migrations',
      [],
      timeoutMs,
    );
    if (result.rows[0]?.version !== REQUIRED_SCHEMA_VERSION) {
      throw new Error('SCHEMA_INCOMPATIBLE');
    }
  }
}
