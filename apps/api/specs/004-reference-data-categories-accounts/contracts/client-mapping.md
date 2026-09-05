# Client Mapping: Reference Data, Categories & Accounts

No client source changes in SPEC-BE-004. This manifest is contract-test input for
backend responses and later SPEC-BE-014 adapters.

## Mobile Account Mapping

| Current field/operation | Backend contract | Disposition |
|---|---|---|
| `id`, `name`, `type`, `currencyCode` | account fields | field-compatible; server DTO also carries `version` |
| seven account types | identical allowlist | direct; no collapsing |
| `openingBalanceMinor` | create request only | zero allowed; nonzero unavailable until 005; never stored on account |
| `includeInTotals` | account aggregation flag | omitted clients receive server default `true` |
| `institution`, `lastFour` | institution/last-four | direct, masked/safe |
| `creditLimitMinor` | credit-card metadata | direct, nonnegative |
| `isDefault` | atomic default flag | direct |
| `iconKey`, `colorKey`, `notes` | safe account metadata | direct |
| `status active|archived` | active/archive/restore | direct; backend also has terminal closed |
| `listAccountBalances` | SPEC-BE-005 projection | omitted from Phase 04 response; no fake zero |
| `archiveAccount`, `restoreAccount` | archive/restore routes | adapter must supply `expectedVersion` and `Idempotency-Key` |

## Mobile Category Mapping

| Current field/operation | Backend contract | Disposition |
|---|---|---|
| `id` | UUID or deterministic system UUID | adapter maps stable `systemKey` to current seed key |
| `kind system|custom` | derived `scope` | never client-writable authority |
| `labelAr`, `labelEn` | bilingual system and custom labels | direct; either locale may fall back only at presentation time |
| `parentId` | parent UUID | direct after ID mapping |
| `iconKey`, `colorKey` | icon/color | direct |
| `isFavorite` | device presentation preference | remains local; not server authority |
| `status active|archived|merged` | active/deleted/merge metadata | direct lifecycle mapping |
| `mergedIntoId` | merge target | direct after ID mapping |
| create/update/archive/restore/merge | category routes | adapter supplies version/idempotency; backend denies system archive/merge and merge reclassifies through the ledger-owned command |

User category requests without a financial kind default to `expense`, matching the
current create UI. Later explicit clients may submit income/transfer.

## Mobile Exchange Rate Mapping

| Current field | Backend field |
|---|---|
| `rate` | decimal converted to safe response number only within supported range |
| `asOf` | `effectiveAt` epoch conversion |
| `status available` | eligible approved row |
| `status stale|unavailable` | `FX_UNAVAILABLE`; adapter may distinguish stale from age evidence, but never invents a rate |

## Admin Mapping

- Governance supported-country/currency lists consume enabled code projections.
- Backend-only permission keys are `reference.read` and `reference.write`; the
  pinned Admin client permission manifest is unchanged in Phase 04.
- Exchange-rate provider health remains a future SPEC-BE-013 projection; Phase 04
  exposes only reference metadata management and safe unavailability metrics.
- Admin list/filter/sort is server-side and bounded; no fixture role header grants
  authority.

## Drift Tests

- Account type/status and safe-field parity.
- System category key set and financial-kind mapping.
- Category lifecycle/merge mapping and ledger-owned transaction reclassification.
- Exchange available/unavailable behavior and no cross-currency aggregation.
- Admin permission names and governance code projections.
- No Mobile/Admin imports in production backend source.

## Category Lifecycle Mapping Addendum

- Mobile maps `linkedTransactionCount` and `version` without coercing another
  field or deriving the count from the rendered list.
- Archive sends both preview values as query preconditions; merge sends them in
  its body with `targetId`.
- Mock and live adapters expose the same preview/action contract. Phase 14 still
  owns any whole-application provider cutover.
