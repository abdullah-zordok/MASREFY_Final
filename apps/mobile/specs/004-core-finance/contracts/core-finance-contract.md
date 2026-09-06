# Contract: Home, Accounts, Transactions, and Categories

This contract defines user-visible behavior and the typed boundaries between SPEC-004 routes,
features, mock services, and local storage. It does not define production APIs, tracking analysis,
voice analysis, reports, obligations, or assistant behavior.

## 1. Route Contract

| Route | Responsibility |
|---|---|
| `/(tabs)/home` | Derived financial summary, quick actions, recovery/status previews, and recent activity |
| `/(tabs)/transactions` | Virtualized ledger, search, sort, filters, and state recovery |
| `/(tabs)/add` | Amount-first manual entry and resumable draft |
| `/transactions/[id]` | Detail, relationships, source, status, and eligible correction actions |
| `/accounts` | Account totals, search, active/archived lists, and add entry |
| `/accounts/new` | Account creation |
| `/accounts/[id]` | Derived balances, activity, summary, and management actions |
| `/accounts/[id]/edit` | Account metadata editing and archive impact |
| `/categories` | Searchable system/custom hierarchy, favorites, archive, and merge |
| `/categories/new` | Bilingual custom category creation |
| `/categories/[id]` | Category editing, archive impact, and merge impact |
| `/modals/account-picker` | Searchable account selection with archive restrictions |
| `/modals/category-picker` | Searchable recent/favorite/hierarchical category selection |
| `/modals/transaction-filters` | Combined ledger filters with apply and clear actions |

Secondary routes return to their originating context. Accounts and Categories do not become new
primary tabs. Existing Home links to assistant, voice, tracking, reports, budgets, obligations,
and savings remain links to their owning specifications.

## 2. Typed Service Boundary

The implementation provides replaceable contracts equivalent to:

```ts
interface CoreFinanceService {
  getHomeSummary(input: HomeSummaryInput): Promise<HomeSummary>;

  listAccounts(input?: AccountListInput): Promise<readonly AccountSummary[]>;
  getAccount(id: string): Promise<AccountDetail>;
  createAccount(input: AccountInput): Promise<MutationResult<Account>>;
  updateAccount(id: string, input: AccountInput): Promise<MutationResult<Account>>;
  archiveAccount(id: string): Promise<ImpactPreview>;
  confirmArchiveAccount(id: string): Promise<MutationResult<Account>>;
  adjustBalance(input: BalanceAdjustmentInput): Promise<MutationResult<Transaction>>;

  listTransactions(input: TransactionQuery): Promise<TransactionPage>;
  getTransaction(id: string): Promise<TransactionDetail>;
  saveDraft(input: TransactionDraftInput): Promise<TransactionDraft>;
  discardDraft(id: string): Promise<void>;
  createTransaction(input: CreateTransactionInput): Promise<MutationResult<Transaction>>;
  updateTransaction(id: string, input: UpdateTransactionInput): Promise<MutationResult<Transaction>>;
  createTransfer(input: TransferInput): Promise<MutationResult<Transaction>>;
  createRefund(input: RefundInput): Promise<MutationResult<Transaction>>;
  previewDelete(id: string): Promise<ImpactPreview>;
  deleteTransaction(id: string): Promise<DeleteResult>;
  undoDelete(id: string): Promise<MutationResult<Transaction>>;

  listCategories(input?: CategoryListInput): Promise<readonly CategoryNode[]>;
  createCategory(input: CategoryInput): Promise<MutationResult<Category>>;
  updateCategory(id: string, input: CategoryInput): Promise<MutationResult<Category>>;
  archiveCategory(id: string): Promise<ImpactPreview>;
  mergeCategory(input: CategoryMergeInput): Promise<ImpactPreview>;
  confirmMergeCategory(input: CategoryMergeInput): Promise<MutationResult<Category>>;

  getConflict(id: string): Promise<SyncConflict>;
  resolveConflict(id: string, resolution: ConflictResolution): Promise<MutationResult<Transaction>>;
}

interface ExchangeRateService {
  getEstimate(input: CurrencyEstimateInput): Promise<CurrencyEstimateResult>;
}
```

Routes and feature components never access SQLite directly. Production-compatible adapters may
replace mock services later without changing route behavior.

## 3. Query Ownership Contract

TanStack Query owns these service-shaped scopes:

- `home.summary(profileCurrency, period)`
- `accounts.list(status)` and `accounts.detail(id)`
- `transactions.list(filters, cursor)` and `transactions.detail(id)`
- `categories.list(status, search)`
- `conflicts.detail(id)`

Mutation results return affected scopes. The client invalidates only affected summaries, lists,
details, and selectors. Financial records are not mirrored in Zustand; transient filter editing
may be stored there until Apply or Clear.

## 4. Financial Mutation Contract

- Every mutation validates input before opening a write transaction.
- Multi-record financial effects commit atomically or leave no partial change.
- Repeated submission while a mutation is pending is disabled and idempotent by operation id.
- Account current balance is never directly overwritten.
- Balance correction creates an adjustment transaction.
- Transfer affects source and destination atomically and does not count as income or expense;
  any fee remains explicit.
- Refund/reversal retains its original transaction relationship and never becomes salary.
- Automatic records received from SPEC-005 expose source and eligible correction but are not
  classified or detected by this service.
- Safe errors map to retry, keep editing, save locally, review conflict, or return actions; raw
  database/provider errors never reach the user.

## 5. Delete and Undo Contract

1. Preview identifies affected account and summary values.
2. Confirmation marks the eligible transaction deleted and removes its active effects.
3. A polite live-region message exposes Undo for exactly 30 seconds.
4. Undo restores the prior status and effects atomically.
5. Expiry keeps a deletion marker and removes Undo; detail/correction guidance remains safe.
6. App backgrounding or restart does not extend the persisted deadline.

## 6. Currency Estimate Contract

- The user's profile currency is the aggregate currency.
- Each converted component retains original amount, currency, rate, and `asOf` timestamp.
- Converted totals are visibly and accessibly labeled estimated.
- Accounts with unavailable rates are excluded and listed in a warning.
- A total never implies that an excluded balance was included.
- Real exchange-rate retrieval is outside SPEC-004.

## 7. Offline and Conflict Contract

- Valid manual transactions and drafts may be saved locally while offline.
- Pending and failed synchronization states remain editable and visibly distinct.
- A conflict preserves local and later snapshots before showing comparison.
- Resolution offers exactly: keep local, keep later, or deliberately keep both.
- No resolution occurs by dismissal, timeout, or last-write-wins.
- Successful resolution returns the selected record or records to pending synchronization.

## 8. Account Contract

- Duplicate names are allowed; type, masked identifier, institution, and currency disambiguate.
- Only one active account may be the default.
- Currency cannot change after posted activity exists; the user receives a safe alternative.
- Archived accounts keep historical relationships and cannot be selected for unsupported new activity.
- Account detail uses derived current and available balances, never an independent stored total.
- Credit limit and available credit appear only where financially relevant.

## 9. Category Contract

- System and custom categories share one searchable hierarchy.
- Custom categories require non-empty Arabic and English labels.
- Parent selection cannot introduce a cycle.
- Identity never depends on icon or color alone.
- Archive and merge show affected transaction count before confirmation.
- Merge reclassifies all source references to one active target, marks the source merged, records
  the target relationship, and exposes only the target in future selectors.

## 10. Ledger and Filter Contract

- Ledger order is deterministic and grouped by local calendar date.
- Search and filters execute against repository queries, not the rendered page only.
- Active filters are visible, individually removable, and clearable together.
- First-use empty and filtered-empty have distinct messages and actions.
- Page boundaries do not duplicate or omit transactions when dates and amounts match.
- Every row communicates amount/currency, meaning, title, account, date, source, and applicable
  status through text and accessibility semantics in addition to visual styling.

## 11. Form and Draft Contract

- Amount is the dominant field after transaction type selection.
- Required fields are type, amount, account/payment source, category, and date, except fields that
  are financially inapplicable to the selected type.
- Validation preserves valid values, identifies the exact field and correction, and focuses the
  first invalid field.
- Meaningful drafts survive validation, route interruption, and app restart.
- Leaving a meaningful draft offers Keep Editing and Discard; dismissal keeps editing.
- A successful save clears only the saved draft after the ledger mutation commits.

## 12. State Contract

Home, ledger, account, category, selector, detail, and entry surfaces define applicable states:

- initial/loading/skeleton
- ready/populated
- first-use empty
- filtered/search empty
- partial/stale
- error with retry
- offline with usable local actions
- sync pending, failed, and conflict
- archived/disabled
- mutation pending/success/failure
- delete undo/expired

No state relies on color, icon, motion, or haptic feedback alone.

## 13. Privacy, Localization, and Accessibility Contract

- Existing global hidden-balance state applies to Home, Accounts, ledger, details, previews,
  dialogs, accessibility output, and external display protection.
- No financial amount, merchant, account identifier, note, or conflict snapshot enters analytics
  or raw error payloads.
- Every visible and accessible string exists in Arabic and English catalogs.
- Financial numbers use English numerals with locale-aware formatting and stable mixed-direction
  reading; directional controls mirror only when their meaning requires it.
- Controls expose accessible name, role, state, error, and action and measure at least 44 by 44.
- Critical tasks remain usable at 200% text, with screen readers, reduced motion, open keyboard,
  grayscale, and 320 by 568 logical pixels.

## 14. Category Lifecycle Preview

`getCategoryUsage(id)` returns `{linkedTransactionCount, version}`. Archive and
merge accept that exact preview, fail with `conflict` when it is stale, and never
accept system categories. The live adapter sends the preview to the owner API;
the local adapter derives it from the persisted repository immediately before
confirmation.

## 15. Credit-Card Terms and Payoff

- `Account` carries nullable `statementDay`, `paymentDueDay`,
  `monthlyInterestRateBasisPoints`, and `minimumPaymentMinor` values.
- Old local or sync records default all four values to null. Changing account
  type away from `credit_card` clears them and `creditLimitMinor`.
- `calculateCreditCardPayoff` accepts explicit integer minor-unit balance and
  payment plus integer monthly basis points. It rounds each positive monthly
  interest charge half up at 10,000 bps per 100%, uses at most 1,200 months, and
  returns the same payoff/non-payoff union as the owner API.
