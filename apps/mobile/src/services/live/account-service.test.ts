import { createLiveAccountService } from './account-service';

const terms = {
  statementDay: 7,
  paymentDueDay: 21,
  monthlyInterestRateBasisPoints: 125,
  minimumPaymentMinor: 5_000
};
const account = {
  id: 'card-1',
  name: 'Card',
  type: 'credit_card',
  currency: 'SAR',
  ...terms,
  automaticTrackingEnabled: false,
  version: 2,
  status: 'active',
  isDefault: false,
  createdAt: '2026-09-06T00:00:00Z',
  updatedAt: '2026-09-06T00:00:00Z'
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

it('maps card terms through authenticated create and read', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({ account }, 201))
    .mockResolvedValueOnce(response(account));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });
  const created = await service.createAccount(
    {
      name: 'Card',
      type: 'credit_card',
      currencyCode: 'SAR',
      openingBalanceMinor: 0,
      ...terms,
      automaticTrackingEnabled: false
    },
    'create-key'
  );
  expect(created).toMatchObject({
    ...terms,
    currencyCode: 'SAR',
    version: 2,
    automaticTrackingEnabled: false
  });
  expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toMatchObject({
    ...terms,
    currency: 'SAR'
  });
  expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: 'Bearer owner',
    'Idempotency-Key': 'create-key'
  });
  await expect(service.getAccount('card-1')).resolves.toEqual(created);
});

it('keeps the complete draft after a conflict and sends an explicitly resolved retry', async () => {
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValueOnce(response({}, 409))
    .mockResolvedValueOnce(response({ ...account, version: 3 }))
    .mockResolvedValueOnce(response({ ...account, ...terms, version: 4 }));
  const service = createLiveAccountService({
    baseUrl: 'https://api.test',
    token: async () => 'owner',
    request
  });
  const draft = {
    name: 'Card',
    type: 'credit_card' as const,
    currencyCode: 'SAR',
    openingBalanceMinor: 0,
    ...terms
  };
  await expect(
    service.updateAccount('card-1', draft, 2, 'edit-1')
  ).rejects.toThrow('conflict');
  const latest = await service.getAccount('card-1');
  await expect(
    service.updateAccount('card-1', draft, latest.version, 'edit-2')
  ).resolves.toMatchObject({ ...terms, version: 4 });
  expect(draft).toMatchObject(terms);
  expect(JSON.parse(String(request.mock.calls[2]?.[1]?.body))).toMatchObject({
    ...terms,
    expectedVersion: 3
  });
  expect(
    JSON.parse(String(request.mock.calls[2]?.[1]?.body))
  ).not.toHaveProperty('currency');
});
