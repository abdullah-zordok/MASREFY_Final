# UI Contract: R02 Account Presentation and Selection

This contract preserves current account service/domain behavior and defines only typed UI boundaries.

## 1. Account Row Contract

Inputs are localized account identity, masked identifier/currency context, an authoritative balance projection, supplied default/archive/inclusion state, hidden state, and open callback.

- Unknown or unavailable balance is never rendered as zero.
- Hidden balance has no accessible value.
- Status uses text/structure in addition to color/icon.
- Long mixed-script names and identifiers reflow at 200% text.
- The row is one 44×44-or-larger action where opening is supported.

## 2. Account Detail Contract

Order:

1. account identity and authoritative balance summary;
2. type, currency, masked identity, default/archive/inclusion context where supplied;
3. R04-owned recent activity integration;
4. current edit, transfer, archive, or restore actions.

Missing/loading/error/hidden/action-working/failure states are explicit. Detail does not calculate balance or transaction effects.

## 3. Account Form Contract

- Create/edit use existing validation and service commands.
- Current balance is never editable; opening balance remains the existing input.
- Currency keeps current create/edit behavior.
- Optional stored fields not shown remain unchanged on edit.
- One primary Save action; pending state blocks duplicate submission.
- Dirty dismissal invokes keep-editing/discard confirmation; no new persistent draft exists.

## 4. Account Picker Contract

Controlled inputs/callbacks:

- `selectedId`;
- eligible current accounts and their supplied presentation;
- search query/change;
- `onSelect(account)`;
- `onCancel()`;
- optional caller-supported create navigation.

R02 owns selection/search/empty/error/modal presentation. The caller owns its draft/filter and applies the selected account. Archived accounts are not selectable; if shown, their unavailable reason is explicit.

## 5. State Mapping

- Query initial: loading skeleton.
- No records: account-management empty state.
- Search with no match: no-result state preserving query.
- Query/transport failure: mapped error and retry.
- Account archive/default: from Account.
- Inclusion/exclusion: only from supplied aggregate projection.
- Hidden: from shared sensitive-visibility owner.
- Account sync/stale/pending: never inferred because the current account contract does not supply it.

## 6. Direction, Access, Privacy, and Motion

- Arabic RTL/English LTR use the same data/actions and logical start/end layout.
- Amount/currency/masked-digit runs use shared formatting and bidi isolation.
- Screen-reader order follows identity → value/status → action; hidden values are omitted.
- Keyboard/safe areas keep form and picker actions reachable.
- Standard motion is 100–240 ms; reduced motion presents final state immediately.
- Sensitive identifiers/amounts remain protected in UI, accessibility, errors, evidence, and app switcher.

## 7. Ownership Matrix

| Concern | Owner |
|---|---|
| Shared tokens/amount/privacy/forms/overlay/state | R01 |
| Account identity/list/detail/form/picker presentation | R02 |
| Account validation/default/archive/balance rule/persistence | Existing core finance |
| Transaction rows/actions | R04 |
| Caller draft/filter and applying picker result | Caller area |

## 8. Automatic Tracking Presentation

For bank, debit-card, credit-card, wallet, and savings accounts, create/edit
forms own a boolean `automaticTrackingEnabled` input and detail renders the saved
state. Cash and other accounts render neither control nor state. Presentation
does not promise tracking eligibility: global consent and the server gate remain
authoritative.

