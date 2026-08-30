import { LedgerRepository } from '../../../src/ledger/ledger.repository';

describe('ledger worker database boundary', () => {
  it('sets the worker role and the two-second database statement timeout transaction-locally', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve({
        rows: sql.includes('reconcile_account_balance') ? [] : [],
      }),
    );
    const repository = new LedgerRepository({
      withClient: (action: (client: { query: typeof query }) => unknown) => action({ query }),
    } as never);

    await repository.reconcile(null, 100);

    expect(query).toHaveBeenNthCalledWith(
      2,
      "select set_config('statement_timeout','2000ms',true),set_config('role','masarifi_worker',true)",
    );
  });
});
