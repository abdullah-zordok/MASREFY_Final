import { createSeededFinancialPlanningService } from '@/services/mocks/financial-planning-service';
import { fixtureObligation } from '@/test-utils/financial-planning-fixtures';

it('lists details and lifecycle history for obligations', async () => {
  const service = createSeededFinancialPlanningService();
  const detail = await service.getObligation(fixtureObligation.id);
  expect(detail.schedule.length).toBeGreaterThan(0);
  expect(detail.status).toMatchObject({
    paidMinor: 12_000_00,
    remainingMinor: { status: 'available', value: 48_000_00 }
  });
  const overview = await service.getObligationsOverview({ status: 'active' });
  expect(overview.remainingByObligationId).toEqual({
    [fixtureObligation.id]: 48_000_00
  });
  expect(overview.payablesByCurrency).toEqual({ SAR: 48_000_00 });
  expect(overview.receivablesByCurrency).toEqual({});
  const paused = await service.setObligationStatus(
    fixtureObligation.id,
    fixtureObligation.version,
    'paused',
    'op-obligation-pause'
  );
  expect(paused.value.status).toBe('paused');
});

it('sums visible active obligations by currency and excludes paused rows', async () => {
  const service = createSeededFinancialPlanningService();
  const create = (
    title: string,
    direction: 'payable' | 'receivable',
    currencyCode: string,
    contractedTotalMinor: number | null
  ) =>
    service.createObligation(
      {
        direction,
        type: 'custom',
        scheduleKind: 'open_ended',
        title,
        currencyCode,
        contractedTotalMinor
      },
      `create-${title}`
    );

  const firstOmrPayable = await create('OMR payable', 'payable', 'OMR', 12_345);
  const secondOmrPayable = await create(
    'Second OMR payable',
    'payable',
    'OMR',
    7_655
  );
  await create('Large BHD payable', 'payable', 'BHD', Number.MAX_SAFE_INTEGER);
  await create('Overflow BHD payable', 'payable', 'BHD', 1);
  await create('JPY receivable', 'receivable', 'JPY', 12_345);
  await create('Unknown SAR payable', 'payable', 'SAR', null);
  await service.setObligationStatus(
    fixtureObligation.id,
    fixtureObligation.version,
    'paused',
    'pause-seeded-obligation'
  );

  const overview = await service.getObligationsOverview({ status: 'active' });
  expect(overview.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: 'OMR payable', status: 'active' }),
      expect.objectContaining({
        title: 'Second OMR payable',
        status: 'active'
      }),
      expect.objectContaining({ title: 'JPY receivable', status: 'active' })
    ])
  );
  expect(overview.items.some((item) => item.id === fixtureObligation.id)).toBe(
    false
  );
  expect(overview.payablesByCurrency).toEqual({
    BHD: null,
    OMR: 20_000,
    SAR: null
  });
  expect(overview.remainingByObligationId).toMatchObject({
    [firstOmrPayable.value.id]: 12_345,
    [secondOmrPayable.value.id]: 7_655
  });
  expect(overview.receivablesByCurrency).toEqual({ JPY: 12_345 });
});
