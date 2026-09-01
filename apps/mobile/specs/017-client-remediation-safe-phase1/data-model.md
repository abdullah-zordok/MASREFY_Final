# Data Model: Remaining Safe Phase 1 Client Remediation

## Category

Keep existing identity, labels, parent, visuals, provenance (`kind`), lifecycle, merge, and
timestamps. Add `financialType: 'income' | 'expense'` for selectable categories; legacy rows may
temporarily hold `null` only while quarantined from active selection.

Rules:

- System and custom categories declare one financial type; transfer is never one.
- `remittance` is one stable active system expense category.
- Legacy system values come from a deterministic map. Only unambiguous custom history may be
  inferred; ambiguous active records are archived with `financialType: null` rather than guessed,
  while existing archived/merged lifecycle state is preserved.

## Transaction

Keep existing fields/lifecycle. Add optional
`transferPurpose: 'internal' | 'card_payoff' | null`.

Rules:

- Non-transfer transactions use `null`; ordinary transfers use `internal`; payoff uses
  `card_payoff`; every transfer has `categoryId: null`.
- A refund references a posted eligible expense in the same account and currency.
- Active cumulative refunds never exceed the original amount.

## Card Payoff Command

Fields: `fundingAccountId`, `cardAccountId`, `amountMinor`, `currencyCode`, `occurredAt`, `title`,
optional `notes`, and `operationId`.

Validation: positive safe integer; distinct active accounts; same currency; destination is a
credit card with negative current balance; amount is no more than funding balance or card debt.

```text
valid request -> one posted transfer -> durable operation result
same operation retry -> existing result, no new effect
invalid request -> no transaction and no operation result
```

## Linked Refund State

Derived, not stored in a new table: eligible original amount, active refunded amount, remaining
refundable amount, and `partial | full`. Inactive linked records create no active effect.

## Obligation Summary

Keep current obligation, schedule, and payment records. Derive contracted, paid, remaining, and
direction values with `deriveObligationStatus`. Payable and receivable totals sum visible
remaining values separately. Net worth never infers liability from `fundingAccountId`.

## Tracking Availability

No new persisted entity. Runtime selection yields explicit `demo`, `unavailable`, or `disabled`.
`supported` remains reserved for a later approved provider and is not implemented here.

## Canonical Financial Scenario

- bank opening `100000`; card opening `-32000`; payoff `20000`
- eligible expense `10000`; linked refund `2500`; category-free internal transfer
- post-payoff bank `80000`, card `-12000`, account net worth `68000`
- net expense `7500`; transfer/payoff income and expense both zero
- payable and receivable obligations remain separate
- every record carries integer minor units plus source id/version/update evidence
