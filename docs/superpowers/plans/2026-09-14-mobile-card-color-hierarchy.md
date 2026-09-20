# Mobile Card Color Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every mobile light-theme card read as pure white against a clearly separate neutral canvas while preserving Masarifi's teal identity and semantic financial colors.

**Architecture:** Remap the existing semantic light-theme surface roles, add a card-specific elevation token, and let shared primitives propagate the treatment. Audit only card-like local overrides that bypass the shared primitives; keep hero glass, icon foregrounds, overlays, and dark mode behavior separate.

**Tech Stack:** React Native 0.83, Expo 55, TypeScript 5.9, Jest, React Native Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-mobile-card-color-hierarchy-design.md`

## Global Constraints

- Mobile app only; do not modify Admin Web.
- Light page canvas is `#F6F7F5`; standard cards remain `#FFFFFF`.
- Standard card borders are `#D7E1DC`; internal dividers remain `#E7E9E6`.
- Inset controls remain `#F1F5F3`.
- Preserve the dark-teal hero, glass cards, financial/status colors, copy, layout, RTL/LTR behavior, and dark theme.
- Do not add a dependency or introduce raw colors in feature files.
- Preserve the user's existing uncommitted notification/tracking work in `TrackingHomeCard.tsx` and its tests.

---

### Task 1: Lock the semantic surface hierarchy

**Files:**
- Modify: `apps/mobile/src/design-system/tokens.test.ts`
- Modify: `apps/mobile/src/design-system/tokens.ts`

**Interfaces:**
- Produces: `lightThemeColors.surfaces.page`, `lightThemeColors.surfaces.card`, `lightThemeColors.surfaces.inset`, `lightThemeColors.borders.default`, and `elevation.card`.

- [ ] **Step 1: Change the token test first**

Update the light hierarchy assertion to require:

```ts
expect(lightThemeColors).toMatchObject({
  background: '#F6F7F5',
  surfaces: {
    page: '#F6F7F5',
    card: '#FFFFFF',
    inset: '#F1F5F3'
  },
  borders: {
    default: '#D7E1DC',
    subtle: '#E7E9E6'
  }
});

expect(elevation.card).toMatchObject({
  elevation: 3,
  shadowColor: '#0B2F29',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12
});
```

- [ ] **Step 2: Verify the new assertions fail for the missing hierarchy**

Run: `npm test -- --runInBand src/design-system/tokens.test.ts`

Expected: FAIL because the page is still `#EEF6F4`, the subtle border is still `#EEF3F0`, and `elevation.card` does not exist.

- [ ] **Step 3: Apply the minimal semantic-token change**

In `tokens.ts`:

```ts
background: colorTokens.neutral.warmSurface,
surfaces: {
  page: colorTokens.neutral.warmSurface,
  // other roles unchanged
},
borders: {
  default: colorTokens.sand['400'],
  subtle: colorTokens.neutral.warmBorder,
  // other roles unchanged
}
```

Add the card elevation without changing `elevation.raised`, because navigation and overlays already depend on it:

```ts
card: {
  shadowColor: colorTokens.teal['950'],
  shadowOpacity: 0.1,
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 12,
  elevation: 3
}
```

- [ ] **Step 4: Verify the token contract**

Run: `npm test -- --runInBand src/design-system/tokens.test.ts`

Expected: PASS with the dark-theme assertions unchanged.

- [ ] **Step 5: Commit the token contract**

```bash
git add apps/mobile/src/design-system/tokens.ts apps/mobile/src/design-system/tokens.test.ts
git commit -m "style(mobile): strengthen card surface hierarchy"
```

### Task 2: Apply the treatment through shared card primitives

**Files:**
- Modify: `apps/mobile/src/design-system/components/primitives.test.tsx`
- Modify: `apps/mobile/src/design-system/components/SurfaceCard.tsx`
- Modify: `apps/mobile/src/design-system/components/navigation/GroupedList.test.tsx`
- Modify: `apps/mobile/src/design-system/components/navigation/GroupedList.tsx`

**Interfaces:**
- Consumes: `elevation.card` and the semantic surface/border roles from Task 1.
- Produces: one consistent standalone-card treatment and one consistent grouped-list container treatment.

- [ ] **Step 1: Write failing primitive assertions**

Change the `SurfaceCard` expectation to require the default card border and card elevation:

```ts
expect(screen.getByTestId('surface-card')).toHaveStyle({
  backgroundColor: lightThemeColors.surfaces.card,
  borderColor: lightThemeColors.borders.default,
  borderRadius: radius.card,
  borderWidth: 1,
  shadowOpacity: elevation.card.shadowOpacity
});
```

Update the grouped-list test to assert the same container surface, border, and `elevation.card.shadowOpacity` while retaining row separators.

- [ ] **Step 2: Verify both tests fail against the current primitives**

Run: `npm test -- --runInBand src/design-system/components/primitives.test.tsx src/design-system/components/navigation/GroupedList.test.tsx`

Expected: FAIL because both components still use the subtle border and/or `elevation.raised`.

- [ ] **Step 3: Update the shared primitives**

Use `elevation.card`, `theme.colors.surfaces.card`, and `theme.colors.borders.default` in `SurfaceCard`. Apply the same outer treatment to `GroupedList`; keep individual grouped rows shadow-free.

- [ ] **Step 4: Verify the shared primitives**

Run: `npm test -- --runInBand src/design-system/components/primitives.test.tsx src/design-system/components/navigation/GroupedList.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the shared treatment**

```bash
git add apps/mobile/src/design-system/components/SurfaceCard.tsx apps/mobile/src/design-system/components/primitives.test.tsx apps/mobile/src/design-system/components/navigation/GroupedList.tsx apps/mobile/src/design-system/components/navigation/GroupedList.test.tsx
git commit -m "style(mobile): apply shared white card treatment"
```

### Task 3: Remove card-like bypasses of the shared roles

**Files:**
- Modify where the audit confirms a card surface: `apps/mobile/src/features/accounts/AccountDetailScreen.tsx`
- Modify: `apps/mobile/src/features/accounts/AccountRow.tsx`
- Modify: `apps/mobile/src/features/accounts/AccountTypeSelectionScreen.tsx`
- Modify: `apps/mobile/src/features/budgets/BudgetOverviewScreen.tsx`
- Modify: `apps/mobile/src/features/budgets/BudgetForm.tsx`
- Modify: `apps/mobile/src/features/categories/CategorySelectionScreen.tsx`
- Modify: `apps/mobile/src/features/filters/DateRangeSheet.tsx`
- Modify: `apps/mobile/src/features/reports/ReportsScreen.tsx`
- Modify: `apps/mobile/src/features/settings/CurrencySelectionScreen.tsx`
- Modify: `apps/mobile/src/features/settings/CycleStartDaySelectionScreen.tsx`
- Modify: `apps/mobile/src/features/transactions/TransactionCard.tsx`
- Modify: `apps/mobile/src/features/transactions/TransactionForm.tsx`
- Modify: `apps/mobile/src/features/transactions/TransactionListScreen.tsx`
- Modify only if a local override remains necessary: `apps/mobile/src/features/tracking/TrackingHomeCard.tsx`
- Modify corresponding existing tests beside those components.

**Interfaces:**
- Consumes: the shared roles and `elevation.card` from Tasks 1-2.
- Produces: no new API; screen-local card surfaces use the shared design-system contract.

- [ ] **Step 1: Add failing assertions to the existing affected component tests**

For each existing test that currently checks `elevation.raised` or direct white, change the expected card style to:

```ts
expect(card).toHaveStyle({
  backgroundColor: lightThemeColors.surfaces.card,
  borderColor: lightThemeColors.borders.default,
  shadowOpacity: elevation.card.shadowOpacity
});
```

Add one focused `TrackingHomeCard.test.tsx` assertion covering both `tracking-home-card` and `notification-home-card`. Preserve all current behavior assertions in that dirty file.

- [ ] **Step 2: Verify the focused screen tests fail for local bypasses**

Run:

```bash
npm test -- --runInBand \
  src/features/accounts/AccountRow.test.tsx \
  src/features/accounts/AccountTypeSelectionScreen.test.tsx \
  src/features/categories/CategorySelectionScreen.test.tsx \
  src/features/settings/CurrencySelectionScreen.test.tsx \
  src/features/settings/CycleStartDaySelectionScreen.test.tsx \
  src/features/transactions/TransactionForm.test.tsx \
  src/features/tracking/TrackingHomeCard.test.tsx
```

Expected: FAIL only where card-like surfaces still use `colorTokens.surface.white`, `theme.colors.surface`, or `elevation.raised`.

- [ ] **Step 3: Migrate only confirmed card surfaces**

Replace card fills with `theme.colors.surfaces.card`, card outlines with `theme.colors.borders.default`, and card shadows with `elevation.card`. Leave these untouched:

- white text/icons on dark teal;
- hero glass cards;
- modal scrims and overlay elevation;
- bottom navigation elevation;
- selected, status, income, and expense colors;
- grouped-row separators.

Do not add a special tracking-card color; the global card hierarchy should make both tracking and notification cards white automatically.

- [ ] **Step 4: Verify the focused screen tests pass**

Run the same focused Jest command from Step 2.

Expected: PASS.

- [ ] **Step 5: Run the design-system boundary scan**

Run: `npm run check:design-system`

Expected: PASS with no new raw feature colors or local token aliases.

- [ ] **Step 6: Commit the bypass cleanup**

```bash
git add apps/mobile/src/features apps/mobile/src/design-system
git commit -m "style(mobile): align card surfaces with semantic colors"
```

### Task 4: Verify the full mobile experience visually and mechanically

**Files:**
- Modify only if verification finds a regression: the smallest owning component and its existing test.
- Capture: versioned Android screenshots under `apps/mobile/` without overwriting the user's existing captures.

**Interfaces:**
- Consumes: completed hierarchy from Tasks 1-3.
- Produces: verified light/dark, RTL/LTR, and large-text evidence.

- [ ] **Step 1: Run the complete automated verification**

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run check:frontend-quality
```

Expected: all commands exit 0 with no failing tests or boundary violations.

- [ ] **Step 2: Capture one bounded Android visual pass**

Capture these representative surfaces in Arabic RTL and English LTR:

1. Home with tracking and notification cards.
2. Accounts list and account detail.
3. Transaction list and transaction form.
4. Reports and one planning screen.
5. Settings/form controls and one bottom sheet.

Repeat Home and one dense list in dark mode, then repeat Home at system font scale `1.3` and restore font scale to `1.0`.

- [ ] **Step 3: Check the visual acceptance criteria**

- White cards are visibly distinct from `#F6F7F5` at every rounded edge.
- Standalone cards have a consistent compact shadow; grouped rows do not look like separate floating cards.
- Inset controls remain subordinate to cards.
- Teal remains the dominant brand/action color.
- Income, expense, status, selection, focus, and dark-mode meanings are unchanged.
- No Arabic/English clipping or large-text overlap appears.

- [ ] **Step 4: Run one confirmation pass after any visual corrections**

Re-run the smallest affected Jest test, then the full commands from Step 1. Recapture only the corrected screens once.

- [ ] **Step 5: Commit verified corrections and screenshots**

```bash
git add apps/mobile/src apps/mobile/*.png
git commit -m "test(mobile): verify card color hierarchy"
```
