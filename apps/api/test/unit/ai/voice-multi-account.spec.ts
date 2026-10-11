import {
  decideVoiceBatch,
  parseVoiceBatchProviderOutput,
  type BatchContext,
} from '../../../src/ai/voice-batch';

const cash = '11111111-1111-4111-8111-111111111111';
const bank = '22222222-2222-4222-8222-222222222222';
const usd = '33333333-3333-4333-8333-333333333333';
const coffee = '44444444-4444-4444-8444-444444444444';
const food = '55555555-5555-4555-8555-555555555555';
const salary = '66666666-6666-4666-8666-666666666666';
const context: BatchContext = {
  recordedAt: '2026-10-10T10:00:00.000Z',
  timezoneOffsetMinutes: -180,
  defaultAccountId: cash,
  references: [
    {
      alias: 'ACCOUNT-1',
      id: cash,
      kind: 'account',
      data: { name: 'النقدية / Cash', currency: 'SAR', type: 'cash' },
    },
    {
      alias: 'ACCOUNT-2',
      id: bank,
      kind: 'account',
      data: { name: 'الراجحي / Al Rajhi', currency: 'SAR', type: 'bank' },
    },
    {
      alias: 'ACCOUNT-3',
      id: usd,
      kind: 'account',
      data: { name: 'Dollar wallet', currency: 'USD', type: 'wallet' },
    },
    { alias: 'CATEGORY-1', id: coffee, kind: 'category', data: { kind: 'expense' } },
    { alias: 'CATEGORY-2', id: food, kind: 'category', data: { kind: 'expense' } },
    { alias: 'CATEGORY-3', id: salary, kind: 'category', data: { kind: 'income' } },
  ],
};
const event = (patch = {}) => ({
  s: 1,
  k: 'e',
  a: '1000',
  c: 'e:SAR',
  b: 'o:',
  g: 'CATEGORY-1',
  d: 'o:',
  m: '',
  i: true,
  q: 1,
  ...patch,
});
const decide = (events: unknown[], selected = context, language = 'ar') =>
  decideVoiceBatch(parseVoiceBatchProviderOutput({ complete: true, language, events }), selected);

describe('Voice independently resolves each owned account', () => {
  it.each(['ar', 'en'])(
    'retains two %s expenses on separately named Cash and Al Rajhi accounts',
    (language) => {
      expect(
        decide(
          [
            event({ a: '5000', b: 'e:ACCOUNT-1', g: 'CATEGORY-2' }),
            event({ s: 2, a: '2000', b: 'e:ACCOUNT-2' }),
          ],
          context,
          language,
        ),
      ).toMatchObject([
        {
          status: 'eligible',
          command: { kind: 'expense', amountMinor: 5000, accountId: cash, categoryId: food },
        },
        {
          status: 'eligible',
          command: { kind: 'expense', amountMinor: 2000, accountId: bank, categoryId: coffee },
        },
      ]);
    },
  );
  it('retains three mixed events and their independent category/account effects', () => {
    expect(
      decide([
        event(),
        event({ s: 2, a: '2500', g: 'CATEGORY-2' }),
        event({ s: 3, k: 'i', a: '-10000', b: 'e:ACCOUNT-2', g: 'CATEGORY-3' }),
      ]),
    ).toMatchObject([
      {
        status: 'eligible',
        command: { kind: 'expense', amountMinor: 1000, accountId: cash, categoryId: coffee },
      },
      {
        status: 'eligible',
        command: { kind: 'expense', amountMinor: 2500, accountId: cash, categoryId: food },
      },
      {
        status: 'eligible',
        command: { kind: 'income', amountMinor: 10000, accountId: bank, categoryId: salary },
      },
    ]);
  });
  it('selects the sole compatible owned account when the saved default uses another currency', () => {
    expect(decide([event({ c: 'e:USD' })])).toMatchObject([
      { status: 'eligible', command: { accountId: usd, currency: 'USD' } },
    ]);
  });
  it('selects the only valid owned account without a saved default', () => {
    const selected = {
      ...context,
      defaultAccountId: null,
      references: context.references.filter((ref) => ref.kind !== 'account' || ref.id === bank),
    };
    expect(decide([event({ c: 'o:' })], selected)).toMatchObject([
      { status: 'eligible', command: { accountId: bank, currency: 'SAR' } },
    ]);
  });
  it('does not infer a sole compatible account from the capped twenty-account reference window', () => {
    const selected = {
      ...context,
      references: [
        ...context.references,
        ...Array.from({ length: 17 }, (_, index) => ({
          alias: `ACCOUNT-${String(index + 4)}`,
          id: `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          kind: 'account',
          data: { currency: 'SAR' },
        })),
      ],
    };
    expect(decide([event({ c: 'e:USD' })], selected)).toEqual([
      { status: 'skipped', reason: 'ambiguous_account' },
    ]);
    expect(decide([event({ c: 'e:USD', b: 'e:ACCOUNT-3' })], selected)).toMatchObject([
      { status: 'eligible', command: { accountId: usd } },
    ]);
  });
  it('requires clarification for several compatible accounts without a default', () => {
    expect(decide([event()], { ...context, defaultAccountId: null })).toEqual([
      { status: 'skipped', reason: 'ambiguous_account' },
    ]);
  });
  it('ignores an unavailable saved default when the only valid compatible sibling exists', () => {
    const selected = {
      ...context,
      references: context.references.map((ref) =>
        ref.id === cash ? { ...ref, data: { ...ref.data, available: false } } : ref,
      ),
    };
    expect(decide([event()], selected)).toMatchObject([
      { status: 'eligible', command: { accountId: bank, currency: 'SAR' } },
    ]);
    expect(decide([event({ b: 'e:ACCOUNT-1' })], selected)).toEqual([
      { status: 'skipped', reason: 'currency_mismatch' },
    ]);
  });
  it.each(['e:ACCOUNT-UNKNOWN', 'a:', 'o:ACCOUNT-1'])(
    'never substitutes the default for explicit invalid or ambiguous evidence %s',
    (b) => {
      expect(decide([event({ b })])).toEqual([{ status: 'skipped', reason: 'ambiguous_account' }]);
    },
  );
  it('does not substitute a compatible account for an explicitly mismatched account', () => {
    expect(decide([event({ b: 'e:ACCOUNT-1', c: 'e:USD' })])).toEqual([
      { status: 'skipped', reason: 'currency_mismatch' },
    ]);
  });
  it('orders extracted decisions by spoken occurrence when provider array order differs', () => {
    expect(decide([event({ s: 2, a: '2500' }), event({ s: 1, a: '1000' })])).toMatchObject([
      { status: 'eligible', command: { amountMinor: 1000 } },
      { status: 'eligible', command: { amountMinor: 2500 } },
    ]);
  });
  it('keeps repeated distinct expenses while skipping an unsafe amount and internal transfer', () => {
    expect(
      decide([
        event(),
        event({ s: 2 }),
        event({ s: 3, a: '' }),
        event({ s: 4, k: 't', a: '20000' }),
      ]).map((item) => (item.status === 'eligible' ? item.command.amountMinor : item.reason)),
    ).toEqual([1000, 1000, 'missing_amount', 'unsupported_event']);
  });
});
