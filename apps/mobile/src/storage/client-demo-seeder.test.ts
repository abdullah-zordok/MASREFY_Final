import { seedClientDemoData } from './client-demo-seeder';

class DemoDatabaseFake {
  rows = new Map<string, Set<string>>();
  records = new Map<string, Map<string, Record<string, unknown>>>();
  statements: string[] = [];
  payloads: string[] = [];
  failOn = '';

  async withExclusiveTransactionAsync(
    operation: (database: DemoDatabaseFake) => Promise<void>
  ) {
    const snapshot = new Map(
      [...this.rows].map(([table, ids]) => [table, new Set(ids)])
    );
    const recordSnapshot = new Map(
      [...this.records].map(([table, records]) => [
        table,
        new Map(
          [...records].map(([id, record]) => [id, { ...record }])
        )
      ])
    );
    try {
      await operation(this);
    } catch (error) {
      this.rows = snapshot;
      this.records = recordSnapshot;
      throw error;
    }
  }

  async getFirstAsync<T>(sql: string, ...values: string[]): Promise<T | null> {
    const table = sql.match(/FROM (\w+)/)?.[1] ?? '';
    if (sql.includes('SELECT payload')) {
      const payload = this.records.get(table)?.get(values[0])?.payload;
      return (typeof payload === 'string' ? { payload } : null) as T | null;
    }
    const ids = this.rows.get(table);
    const id = sql.includes('LIKE')
      ? [...(ids ?? [])].find(
          (candidate) =>
            candidate === values[0] ||
            candidate.startsWith(values[1].replace('%', ''))
        )
      : values[0];
    return (id && ids?.has(id) ? { id } : null) as T | null;
  }

  async runAsync(sql: string, ...values: unknown[]) {
    if (this.failOn && sql.includes(this.failOn))
      throw new Error('seed failed');
    this.statements.push(sql);
    if (sql.startsWith('DELETE FROM demo_seed_markers')) {
      const markers = this.rows.get('demo_seed_markers');
      markers?.delete(String(values[0]));
      this.records.get('demo_seed_markers')?.delete(String(values[0]));
      const prefix = String(values[1]).replace('%', '');
      for (const marker of markers ?? [])
        if (marker.startsWith(prefix)) {
          markers?.delete(marker);
          this.records.get('demo_seed_markers')?.delete(marker);
        }
      return;
    }
    if (sql.startsWith('UPDATE ')) {
      const table = sql.match(/^UPDATE (\w+)/)?.[1] ?? '';
      const id = String(values.at(-1));
      const record = this.records.get(table)?.get(id);
      const columns = sql
        .match(/ SET (.+) WHERE/)?.[1]
        .split(', ')
        .map((assignment) => assignment.split(' = ')[0]);
      columns?.forEach((column, index) => {
        if (record) record[column] = values[index];
      });
      if (typeof values[0] === 'string') this.payloads.push(values[0]);
      return;
    }
    const table = sql.match(/(?:INTO|REPLACE INTO) (\w+)/)?.[1];
    if (!table) return;
    const id = String(values[0]);
    if (typeof values[1] === 'string') this.payloads.push(values[1]);
    const ids = this.rows.get(table) ?? new Set<string>();
    ids.add(id);
    this.rows.set(table, ids);
    const columns = sql.match(/\(([^)]+)\)/)?.[1].split(', ') ?? [];
    const record = Object.fromEntries(
      columns.map((column, index) => [column, values[index]])
    );
    const records = this.records.get(table) ?? new Map();
    records.set(id, record);
    this.records.set(table, records);
  }

  record(table: string, id: string) {
    return this.records.get(table)?.get(id);
  }
}

it('inserts the complete client demo once and writes its marker last', async () => {
  const database = new DemoDatabaseFake();

  expect(
    await seedClientDemoData({
      database: database as never,
      now: Date.UTC(2027, 1, 15),
      timeZone: 'Asia/Riyadh'
    })
  ).toBe(true);
  expect(database.rows.get('finance_accounts')?.has('account-default')).toBe(
    true
  );
  expect(
    database.rows.get('planning_budgets')?.has('demo-budget-current')
  ).toBe(true);
  expect(database.rows.get('tracking_events')?.size).toBeGreaterThan(0);
  expect(database.rows.get('notifications')?.size).toBeGreaterThan(0);
  expect(database.statements.at(-1)).toContain('demo_seed_markers');

  const statementCount = database.statements.length;
  expect(await seedClientDemoData({ database: database as never })).toBe(false);
  expect(database.statements).toHaveLength(statementCount);
});

it('uses additive inserts and rolls every row back when seeding fails', async () => {
  const database = new DemoDatabaseFake();
  database.rows.set('finance_accounts', new Set(['user-account']));
  database.failOn = 'planning_budgets';

  await expect(
    seedClientDemoData({ database: database as never })
  ).rejects.toThrow('seed failed');

  expect(database.rows.get('finance_accounts')).toEqual(
    new Set(['user-account'])
  );
  expect(database.rows.get('demo_seed_markers')).toBeUndefined();
  expect(database.statements.every((sql) => !sql.includes('DO UPDATE'))).toBe(
    true
  );
});

it('persists the requested Arabic demo locale', async () => {
  const database = new DemoDatabaseFake();

  await seedClientDemoData({
    database: database as never,
    now: Date.UTC(2027, 1, 15),
    timeZone: 'Asia/Riyadh',
    locale: 'ar'
  });

  expect(database.payloads).toEqual(
    expect.arrayContaining([
      expect.stringContaining('"title":"فاتورة الكهرباء"'),
      expect.stringContaining('"name":"الميزانية الشهرية"')
    ])
  );
});

it('relocalizes only known demo rows when the requested locale changes', async () => {
  const database = new DemoDatabaseFake();

  await seedClientDemoData({ database: database as never, locale: 'en' });
  const transactionBefore = database.record(
    'finance_transactions',
    'demo-transaction-7'
  );
  const indexesBefore = {
    occurredAt: transactionBefore?.occurred_at,
    updatedAt: transactionBefore?.updated_at
  };
  const payloadBefore = JSON.parse(String(transactionBefore?.payload));
  const reviewBefore = JSON.parse(
    String(
      database.record('tracking_reviews', 'demo-tracking-review-item')?.payload
    )
  );
  const userTransaction = {
    payload: JSON.stringify({ id: 'user-transaction', title: 'User entry' }),
    normalized_title: 'user entry',
    occurred_at: '2027-01-01T00:00:00.000Z',
    updated_at: '2027-01-01T00:00:00.000Z'
  };
  database.rows.get('finance_transactions')?.add('user-transaction');
  database.records
    .get('finance_transactions')
    ?.set('user-transaction', { ...userTransaction });
  const firstPassStatements = database.statements.length;
  expect(
    await seedClientDemoData({ database: database as never, locale: 'ar' })
  ).toBe(true);
  expect(database.statements.slice(firstPassStatements)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('UPDATE finance_transactions')
    ])
  );
  expect(database.payloads).toEqual(
    expect.arrayContaining([expect.stringContaining('استرداد البطاقة')])
  );
  const transactionAfter = database.record(
    'finance_transactions',
    'demo-transaction-7'
  );
  const payloadAfter = JSON.parse(String(transactionAfter?.payload));
  expect(transactionAfter?.occurred_at).toBe(indexesBefore.occurredAt);
  expect(transactionAfter?.updated_at).toBe(indexesBefore.updatedAt);
  expect(transactionAfter?.normalized_title).toBe(
    'فاتورة الكهرباء مزود الكهرباء'
  );
  expect(payloadAfter).toEqual({
    ...payloadBefore,
    title: 'فاتورة الكهرباء',
    merchant: 'مزود الكهرباء',
    notes: 'بيانات عرض تجريبية'
  });
  const reviewAfter = JSON.parse(
    String(
      database.record('tracking_reviews', 'demo-tracking-review-item')?.payload
    )
  );
  expect(reviewAfter).toEqual({
    ...reviewBefore,
    proposedValues: {
      ...reviewBefore.proposedValues,
      merchant: 'متجر محلي'
    }
  });
  expect(database.record('finance_transactions', 'user-transaction')).toEqual(
    userTransaction
  );

  const localizedStatements = database.statements.length;
  expect(
    await seedClientDemoData({ database: database as never, locale: 'ar' })
  ).toBe(false);
  expect(database.statements).toHaveLength(localizedStatements);
});
