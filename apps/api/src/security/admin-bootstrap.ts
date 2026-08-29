import { Pool } from 'pg';

import { buildSecurityEventPayload } from './security.events';

export interface AdminBootstrapInput {
  userId: string;
  approvedBy: string;
  reason: string;
}

function argument(argv: readonly string[], name: string): string {
  const index = argv.indexOf(`--${name}`);
  const value = index < 0 ? undefined : argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('ADMIN_BOOTSTRAP_ARGUMENT_INVALID');
  return value;
}

export function parseBootstrapArgs(argv: readonly string[]): AdminBootstrapInput {
  const input = {
    userId: argument(argv, 'user-id'),
    approvedBy: argument(argv, 'approved-by'),
    reason: argument(argv, 'reason'),
  };
  if (
    input.userId.length > 128 ||
    input.approvedBy.length > 128 ||
    input.userId === input.approvedBy ||
    input.reason.trim() !== input.reason ||
    input.reason.length < 10 ||
    input.reason.length > 500
  ) {
    throw new Error('ADMIN_BOOTSTRAP_ARGUMENT_INVALID');
  }
  return input;
}

export async function bootstrapAdmin(
  pool: Pool,
  input: AdminBootstrapInput,
): Promise<{ assignmentId: string; created: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role masarifi_migration');
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('masarifi:first-super-admin',0))",
    );
    const active = await client.query<{
      id: string;
    }>(`select a.id from public.admin_role_assignments a join public.roles r on r.id=a.role_id
      where r.key='super-admin' and r.enabled and a.revoked_at is null and a.starts_at<=clock_timestamp() and (a.ends_at is null or a.ends_at>clock_timestamp()) limit 1`);
    if (active.rows[0]) {
      await client.query('commit');
      return { assignmentId: active.rows[0].id, created: false };
    }
    const profile = await client.query<{ id: string }>(
      "select id from public.profiles where id=$1 and status='active'",
      [input.userId],
    );
    if (!profile.rows[0]) throw new Error('ADMIN_BOOTSTRAP_PROFILE_NOT_ACTIVE');
    await client.query(
      `insert into public.admin_profiles(user_id,status) values($1,'active') on conflict(user_id) do update set status='active'`,
      [input.userId],
    );
    const assignment = await client.query<{ id: string; role_id: string }>(
      `insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
      select $1,id,$1,$2 from public.roles where key='super-admin' and enabled returning id,role_id`,
      [input.userId, input.reason],
    );
    const row = assignment.rows[0];
    if (!row) throw new Error('ADMIN_BOOTSTRAP_ROLE_MISSING');
    const requestId = `bootstrap:${row.id}`;
    await client.query(
      `select audit.append_event($1,'system','admin.bootstrap_completed','admin_assignment',$2,null,null,$3,$4,$5)`,
      [
        input.approvedBy,
        row.id,
        input.reason,
        requestId,
        JSON.stringify({ procedure: 'two-person' }),
      ],
    );
    await client.query(
      `select private.enqueue_outbox_event('admin.role_assigned','admin_assignment',$1,$2)`,
      [
        row.id,
        JSON.stringify(
          buildSecurityEventPayload('admin.role_assigned', {
            adminId: input.userId,
            roleId: row.role_id,
            assignmentId: row.id,
            occurredAt: new Date().toISOString(),
            requestId,
          }),
        ),
      ],
    );
    await client.query('commit');
    return { assignmentId: row.id, created: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (process.env.MASARIFI_ADMIN_ROUTES_ENABLED === 'true')
    throw new Error('ADMIN_BOOTSTRAP_REQUIRES_DISABLED_ROUTES');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('ADMIN_BOOTSTRAP_DATABASE_MISSING');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await bootstrapAdmin(pool, parseBootstrapArgs(process.argv.slice(2)));
    process.stdout.write(
      `ADMIN_BOOTSTRAP_${result.created ? 'CREATED' : 'ALREADY_COMPLETE'}:${result.assignmentId}\n`,
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write('ADMIN_BOOTSTRAP_FAILED\n');
    process.exitCode = 1;
  });
}
