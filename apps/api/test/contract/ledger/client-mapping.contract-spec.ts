import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

type Summary = {
  id: string;
  kind: string;
  status: string;
  amountMinor: number;
  currency: string;
  accountIds: string[];
  feeMinor: number;
  title: string;
  note: string | null;
  occurredAt: string;
  originalTransactionId: string | null;
  version: number;
  deletedAt: string | null;
  undoExpiresAt: string | null;
};

const toMobile = (value: Summary) => ({
  id: value.id,
  type: value.kind,
  status: value.status === 'confirmed' ? 'posted' : value.status,
  amountMinor: value.amountMinor,
  currencyCode: value.currency,
  accountId: value.accountIds[0],
  destinationAccountId: value.kind === 'transfer' ? (value.accountIds[1] ?? null) : null,
  feeMinor: value.feeMinor,
  notes: value.note,
  occurredAt: Date.parse(value.occurredAt),
  originalTransactionId: value.originalTransactionId,
  version: value.version,
  deletedAt: value.deletedAt === null ? null : Date.parse(value.deletedAt),
  undoExpiresAt: value.undoExpiresAt === null ? null : Date.parse(value.undoExpiresAt),
});

describe('Phase 05 client compatibility boundary', () => {
  const mapping = readFileSync(
    'specs/005-transactions-ledger-integrity/contracts/client-mapping.md',
    'utf8',
  );
  const mobile = readFileSync('../mobile/src/domain/core-finance.ts', 'utf8');
  const admin = readFileSync('../admin-web/src/features/users/contracts.ts', 'utf8');
  const openapi = load(
    readFileSync('specs/005-transactions-ledger-integrity/contracts/openapi.yaml', 'utf8'),
  ) as { components: { schemas: { TransactionSummary: { properties: Record<string, unknown> } } } };

  it('maps every existing Mobile transaction field without enabling Phase 06 sync', () => {
    const fields = [
      'id',
      'type',
      'title',
      'merchant',
      'paymentMethod',
      'amountMinor',
      'currencyCode',
      'accountId',
      'feeMinor',
      'occurredAt',
      'version',
      'deletedAt',
      'undoExpiresAt',
    ];
    for (const field of fields) {
      expect(mobile).toContain(`${field}:`);
    }
    for (const token of [
      'Transaction.id',
      'type',
      'title',
      'merchant',
      'paymentMethod',
      'amountMinor',
      'currencyCode',
      'accountId',
      'feeMinor',
      'occurredAt',
      'version',
      'deletedAt',
      'undoExpiresAt',
    ])
      expect(mapping).toContain(`\`${token}\``);
    expect(mapping).toContain('remain SPEC-BE-006');
  });

  it('executes the wire currency, status, nullable field, and timestamp mapping', () => {
    expect(openapi.components.schemas.TransactionSummary.properties).toHaveProperty('currency');
    expect(openapi.components.schemas.TransactionSummary.properties).not.toHaveProperty(
      'currencyCode',
    );
    expect(
      toMobile({
        id: '10000000-0000-4000-8000-000000000001',
        kind: 'expense',
        status: 'confirmed',
        amountMinor: 125,
        currency: 'SAR',
        accountIds: ['10000000-0000-4000-8000-000000000002'],
        feeMinor: 0,
        title: 'Groceries',
        note: null,
        occurredAt: '2026-08-30T08:00:00.000Z',
        originalTransactionId: null,
        version: 2,
        deletedAt: null,
        undoExpiresAt: null,
      }),
    ).toMatchObject({
      type: 'expense',
      status: 'posted',
      currencyCode: 'SAR',
      accountId: '10000000-0000-4000-8000-000000000002',
      destinationAccountId: null,
      notes: null,
      occurredAt: Date.parse('2026-08-30T08:00:00.000Z'),
      deletedAt: null,
    });
  });

  it('maps Mobile list/detail reads and the account balance projection without a client adapter cutover', () => {
    expect(mapping).toContain('`GET /transactions`, `GET /transactions/:id`');
    expect(mapping).toContain('account summary `confirmedMinor`, `pendingMinor`, `ledgerVersion`');
    expect(mapping).toContain('ordered `accountIds` and detail postings');
    expect(mapping).toContain('offline mutation storage remain SPEC-BE-006');
  });

  it('preserves the Admin aggregate-only boundary and publishes no raw ledger contract', () => {
    expect(admin).toContain('transactionsCount:');
    expect(mapping).toContain('`transactionsCount` only');
    expect(admin).not.toMatch(/transactionPostings|accountBalances|ledgerRows/);
  });

  it('leaves Mobile and Admin source untouched by this backend-only contract', () => {
    expect(() =>
      execFileSync('git', ['diff', '--exit-code', '--', 'apps/mobile', 'apps/admin-web'], {
        cwd: resolve(__dirname, '../../../..'),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
