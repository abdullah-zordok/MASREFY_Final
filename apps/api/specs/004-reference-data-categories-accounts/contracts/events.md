# Event Contracts: Reference Data, Categories & Accounts

All events use the SPEC-BE-001 outbox envelope and are inserted in the resource
transaction. Payloads are JSON objects and contain no names, notes, last four,
rate values, credentials, Admin reasons, or provider secrets.

## Category Events

```ts
interface CategoryEvent {
  categoryId: string;
  userId: string;
  kind: 'income' | 'expense' | 'transfer';
  version: number;
  occurredAt: string;
  changedFields?: readonly string[];
  targetCategoryId?: string;
}
```

Names: `category.created`, `category.updated`, `category.deleted`,
`category.merged`. System-category Admin changes use the same namespace with no
`userId` and include `systemKey` only because it is a bounded public reference key.

## Account Events

```ts
interface AccountEvent {
  accountId: string;
  userId: string;
  version: number;
  occurredAt: string;
  changedFields?: readonly string[];
}
```

Names: `account.created`, `account.updated`, `account.archived`,
`account.closed`. Currency/type/names/last-four/credit-limit/notes are excluded.

## Exchange Rate Event

```ts
interface ExchangeRateRefreshedEvent {
  exchangeRateId: string;
  baseCurrency: string;
  quoteCurrency: string;
  provider: string;
  effectiveAt: string;
  occurredAt: string;
}
```

Name: `exchange-rate.refreshed`. `provider` is an approved bounded key; no rate or
provider payload/reference is emitted.

## Shared Reference Event

```ts
interface ReferenceUpdatedEvent {
  resource: 'currency' | 'country';
  code: string;
  version: number;
  occurredAt: string;
  changedFields: readonly string[];
}
```

Name: `reference.updated`. System-category changes continue to use
`category.updated` so consumers retain the category identity and kind contract.

## Reference Invalidation

Currency, country, and system-category Admin mutations emit their domain event.
The service invalidates its affected local collection only after the database
commit. Outbox delivery informs other consumers, while the bounded database
collection-hash check on every request is the cross-replica correctness boundary;
cache TTL is only the fallback.

## Validation

- Event name must be in the ten-name owned allowlist.
- UUIDs, codes, keys, versions, timestamps, and changed-field names are validated.
- `changedFields` is sorted, unique, allowlisted, and at most 20 entries.
- Customer category/account event requires matching `userId`.
- Unknown fields fail before outbox insertion.
