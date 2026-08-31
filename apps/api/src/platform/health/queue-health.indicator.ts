import { Injectable } from '@nestjs/common';

import { PoolService } from '../database/pool.service';

export type DependencyState = 'up' | 'down';

@Injectable()
export class QueueHealthIndicator {
  constructor(private readonly database: PoolService) {}

  async check(timeoutMs: number): Promise<DependencyState> {
    try {
      const result = await this.database.query<{ healthy: boolean }>(
        `select (
          exists(select 1 from pg_extension where extname = 'pgmq')
        and to_regclass('pgmq."q_platform-events"') is not null
        and to_regclass('public.client_mutations') is not null
        and not exists(
          select 1 from public.client_mutations
          where status='processing' and locked_until<clock_timestamp()-interval '5 minutes'
          limit 1
        )
        and (
          select count(*) from (
            select 1 from public.client_mutations
            where status='rejected' and updated_at>=clock_timestamp()-interval '5 minutes'
            limit 101
          ) recent_sync_failures
        )<=100
        ) as healthy`,
        [],
        timeoutMs,
      );
      return result.rows[0]?.healthy === true ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
