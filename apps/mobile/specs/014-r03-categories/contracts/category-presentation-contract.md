# UI Contract: R03 Category Presentation and Selection

This contract defines presentation boundaries only. Existing category domain/service/repository behavior remains authoritative.

## 1. Category Identity Contract

Inputs: localized label, optional icon/color, kind, parent context, favorite, status, optional merge target, and current action/selection callback.

- Label is authoritative; icon/color never carry identity alone.
- Category icon does not mirror in RTL; navigation disclosure mirrors when required.
- Duplicate labels remain allowed and are distinguishable through supplied hierarchy/kind/status context.
- Long labels reflow at 200% text and controls remain at least 44×44.

## 2. Management List Contract

- Uses normalized bilingual search and native virtualization.
- Includes current system/custom, favorite, active, archived, and merged records.
- Distinguishes no custom categories from no search results.
- Create and detail navigation remain current routes.
- No usage, recency, restriction, sync, or freshness label is invented.

## 3. Create/Edit Contract

- Persistent Arabic/English labels, searchable parent choice/no-parent, favorite, and one Save action.
- Existing validation/service command is authoritative.
- Duplicate labels are valid; invalid required/hierarchy input remains actionable.
- Existing icon/color values are preserved when not edited.
- Dirty dismissal uses local confirmation; duplicate Save is blocked.

## 4. Archive/Restore Contract

The decision names the category, current status, future selection consequence, and existing historical behavior. Confirmation invokes `setCategoryStatus`; working/failure/success is truthful and not optimistic.

## 5. Merge Contract

- Source and selected active target are visible and unambiguous.
- Consequence states existing transaction reclassification and source archive.
- One selected target and explicit confirmation are required.
- Presentation invokes `mergeCategory` and does not inspect or mutate transactions.
- Failure preserves the decision for retry; success follows current invalidation/navigation.

## 6. Picker Contract

Controlled inputs/callbacks: current selection, active eligible categories, optional supplied recent list, favorites, normalized search, `onSelect`, `onCancel`, and optional caller-supported create handoff.

R03 owns selection presentation. The caller owns its transaction/proposal/filter draft and applies the result. Archived/merged categories are not selectable.

## 7. State and Error Mapping

- Query initial → loading.
- No custom categories → management empty guidance while system categories remain.
- Search no result → preserve query and clear/revise action.
- Missing detail/query/storage failure → mapped error/back/retry.
- Category lifecycle → active/archive/merged from Category.
- Synchronization/freshness → not shown because not supplied.

## 8. Direction, Access, Privacy, and Motion

- Arabic/English contain identical identity, fields, consequences, actions, and recovery.
- Mixed labels/digits remain intentionally ordered.
- Screen-reader output includes label, kind, hierarchy, favorite/selection, status, availability, and action.
- Keyboard/safe area keeps parent picker/form actions reachable.
- Status/selection/merge meaning is not color/icon/motion-only.
- Standard motion is brief; reduced motion presents final state immediately.

## 9. Ownership Matrix

| Concern | Owner |
|---|---|
| Shared tokens, form, grouped row, picker, modal, confirmation | R01 |
| Category identity/list/form/detail/picker/merge presentation | R03 |
| Category validation, hierarchy, lifecycle, merge and reclassification | Existing core finance |
| Caller draft and applying picker result | R04/R05/other caller |

## 10. Lifecycle Count Contract

Only custom categories render lifecycle controls. Confirmation names the source
and includes the authoritative linked transaction count. Merge additionally
names an active compatible custom target. The count is not inferred from the
currently loaded transaction page, and stale confirmation state never mutates.

