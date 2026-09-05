# Feature Specification: R03 — Categories

**Feature Branch**: `codex/r01-shared-ui-foundation` (existing worktree reused as requested)

**Created**: 2026-08-15

**Status**: Draft for product review

**Input**: Redesign the existing Masarifi category-management and category-selection experience without changing category data, assignment rules, merge/archive behavior, routes, or callers.

**Primary source of truth**: `D:\MY Work\0Part_Time\MASREFY _Final\apps\mobile\new_Desinge\REDESIGN_ANALYSIS.md`

**Roadmap area**: R03 — Categories

## Ownership and Boundaries

R03 owns presentation for these existing route surfaces:

- `app/categories/_layout.tsx` — protected category route group.
- `app/categories/index.tsx` — searchable category management list.
- `app/categories/new.tsx` — create-category form.
- `app/categories/[id].tsx` — category detail and existing edit mode.
- `app/modals/category-picker.tsx` — category selection mode used by transactions and related features.

R03 also owns category-specific presentation supplied by the existing category list, detail, form, and picker screens. It does not own transaction assignment effects, Add or edit form composition, automatic categorization rules, budget/report calculations, Assistant evidence, shared R01 controls, or Home/More composition.

Entry points remain Home shortcuts, transaction and voice forms, tracking review, budgets, reports, Assistant evidence, and protected deep links. No route is added, removed, renamed, or assigned to another primary owner.

## Current Capability Baseline

Masarifi currently lets an authenticated user:

- search Arabic and English category labels;
- view system and custom categories, favorites, active, archived, and merged states;
- create or edit a category with Arabic label, English label, optional parent, existing icon/color values, and favorite status;
- represent hierarchical parent relationships and prevent a category from parenting itself;
- archive or restore a category;
- merge a source category into a selected target, reclassify existing transactions, archive the source, and retain historical context;
- choose an active category from a searchable, favorite-first picker;
- return the selected category to transaction, voice, tracking, budget, report, or other existing callers;
- show loading, missing, error, empty, validation, saving, and retry outcomes.

These capabilities, system/custom rules, bilingual data, hierarchy, validation, assignment effects, archive/merge consequences, picker return semantics, localization, and downstream financial effects remain unchanged. R03 changes presentation and usability only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find and Understand Categories (Priority: P1)

As a user, I can scan and search a dense category catalogue, understand the label, icon, hierarchy, favorite status, origin, and availability, and open the category I need.

**Why this priority**: Categories improve entry speed and make transaction and report meaning understandable.

**Independent Test**: Open category management with system/custom, parent/child, favorite, active, archived, merged, long bilingual, empty, dense, loading, and error data; search in Arabic and English and verify the correct detail destination.

**Acceptance Scenarios**:

1. **Given** a mixed category catalogue, **When** the list opens, **Then** repeated items use a compact row or accessible grid with visible labels, restrained icon/color support, favorite and system/custom context, hierarchy, and explicit availability.
2. **Given** a search query in Arabic, English, or mixed script, **When** results update, **Then** matching uses the current bilingual category data and the empty result is distinguished from having no custom categories.
3. **Given** archived or merged categories, **When** they appear in management mode, **Then** their state and target context where supplied are written explicitly and not communicated by color or icon alone.
4. **Given** 200% text or a long label, **When** a category row renders, **Then** the label wraps or the row grows without hiding the category identity or action.

---

### User Story 2 - Create or Edit a Bilingual Category (Priority: P1)

As a user, I can create or edit a category with clear Arabic and English labels, optional hierarchy, recognizable visual treatment, and safe validation.

**Why this priority**: The app requires both supported labels and must preserve category meaning across language changes.

**Independent Test**: Create and edit custom categories using long Arabic/English labels, mixed content, existing duplicate labels, invalid data, parent/no-parent choices, favorites, keyboard open, unsaved input, save failure, and language switching; duplicate labels remain allowed and visually distinguishable under current rules.

**Acceptance Scenarios**:

1. **Given** create or edit mode, **When** the form opens, **Then** Arabic and English labels are persistent fields, hierarchy and favorite choices are clearly separated, and one Save action is visually dominant.
2. **Given** a parent catalogue, **When** the user chooses a parent, **Then** current selection, no-parent choice, eligibility, search/density, and self-parent prevention remain understandable without a long radio-card wall.
3. **Given** required, invalid, or relationship input fails validation, **When** Save is attempted, **Then** the affected field and correction are identified, valid input remains, and no category changes.
4. **Given** save succeeds or fails, **When** the operation resolves, **Then** duplicate submission is prevented and the existing category destination and retry behavior remain unchanged.
5. **Given** meaningful unsaved input, **When** navigation or dismissal is attempted, **Then** the approved draft-protection behavior prevents accidental loss.

---

### User Story 3 - Archive, Restore, or Merge with Clear Consequences (Priority: P1)

As a user, I can inspect a category and safely archive, restore, or merge it while understanding how current and historical transactions will be affected.

**Why this priority**: Category management can change how existing financial history is classified and must never feel like a cosmetic toggle.

**Independent Test**: Open active, archived, merged, system-restricted, missing, and in-use categories; attempt supported archive, restore, and merge paths, including failures and repeated submission, and verify exact transaction-classification effects remain unchanged.

**Acceptance Scenarios**:

1. **Given** an existing category, **When** detail opens, **Then** identity, origin, hierarchy, status, and usage context precede edit and consequential actions.
2. **Given** archive is supported, **When** the user requests it, **Then** confirmation names the category, explains future selection and historical-record behavior, and does not report completion until resolved.
3. **Given** merge is supported, **When** the user selects a target, **Then** source and target are visibly distinct, the reclassification/archive consequence is explicit, and a deliberate confirmation is required.
4. **Given** merge/archive fails or the category changes concurrently, **When** the result returns, **Then** no false success appears and the user retains a safe retry or return path.

---

### User Story 4 - Select or Create a Category Without Losing the Originating Task (Priority: P1)

As a user categorizing a transaction, proposal, budget, report filter, or review item, I can find or create an eligible category and return to the exact originating task with all prior input intact.

**Why this priority**: Picker mode is a high-frequency path and must stay focused on a single decision.

**Independent Test**: Open the category picker from manual Add, transaction edit, voice proposal, tracking review, budget, report, and Assistant evidence contexts; search, select, cancel, open existing creation where supported, return, and handle empty/error states without losing caller context.

**Acceptance Scenarios**:

1. **Given** a current category selection, **When** the picker opens, **Then** recent/favorite choices are prioritized, the current selection is explicit, and the full active catalogue remains searchable.
2. **Given** archived, merged, or otherwise ineligible categories, **When** selection mode renders, **Then** they are excluded or clearly unavailable according to current rules and cannot be selected accidentally.
3. **Given** no result, **When** the user follows the existing category-creation path where supported, **Then** saving the new category can return it to the caller without discarding the caller's draft.
4. **Given** the user selects or cancels, **When** the picker closes, **Then** current picker return semantics and the caller's draft, filters, scroll, and route context are preserved.

### Edge Cases

- No custom categories exist while system categories remain available.
- There are hundreds of categories, deep or long hierarchies, duplicate labels, or the same label in both languages.
- Arabic and English labels differ substantially in length or mix merchants, digits, and punctuation.
- An icon or color is missing, invalid, or visually indistinguishable in dark mode.
- A parent becomes archived or merged while a form or picker is open.
- A category attempts to parent itself or create an invalid hierarchy.
- A category in historical or current transactions is archived or merged.
- Source and target categories are confused, identical, concurrently changed, or the merge fails.
- Search produces no results, the only matching category is ineligible, or multiple categories share the same allowed label and require visible identity context.
- A category changes while filters, voice proposals, or transaction drafts are open.
- Save or query fails because connectivity or storage is unavailable and current retry behavior must remain truthful.

## Redesign Scope

- Recompose category management into search, concise scope/context, primary creation action, and grouped system/custom or active/inactive records where useful.
- Evolve repeated category content into a shared row or accessible compact grid with authoritative label, icon container, restrained color cue, hierarchy, favorite, origin, and status.
- Separate management mode from selection mode while reusing the same category identity anatomy.
- Replace long parent/category radio-card stacks with the R01 searchable selection pattern.
- Recompose category detail around identity and consequence before edit/archive/restore/merge actions.
- Use explicit source/target comparison and confirmation for merge; use calm status rather than danger styling for merely archived data.
- Preserve origin context when creating from a picker using existing category creation capability and return semantics.
- Apply R01 semantic surfaces, rows, form fields, overlays, confirmation, state feedback, motion, direction, and accessibility.

## Non-Goals

- No category data, default catalogue, hierarchy rule, favorite rule, assignment rule, archive rule, or merge effect change.
- No new automatic categorization model, merchant intelligence, icon pack, color taxonomy, or production provider.
- No route addition, removal, rename, or ownership change.
- No change to transaction, budget, report, tracking, voice, or Assistant calculations and commands.
- No change to authentication, permission, persistence, synchronization, or privacy behavior.
- No feature-local raw colors, competing selection control, or decorative dependency.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: R03 MUST preserve every owned route, entry point, protected-route decision, picker result, and category command listed in Ownership and Boundaries.
- **FR-002**: Category management MUST distinguish system, custom, parent/child, favorite, active, archived, and merged categories through text or structure as well as visual treatment.
- **FR-003**: Each category item MUST retain an authoritative visible label; icon and color MUST remain supplemental recognition cues.
- **FR-004**: Repeated categories MUST use a compact grouped row or accessible grid appropriate to density and text size rather than a separate elevated card per item.
- **FR-005**: Search MUST use current bilingual labels and distinguish no custom categories from no results under the current query.
- **FR-006**: Management mode MUST retain access to current create, detail, edit, archive, restore, and merge capabilities.
- **FR-007**: Category detail MUST present identity, origin, hierarchy, status, and relevant usage/consequence context before management actions.
- **FR-008**: Archive and restore presentation MUST name the category and explain current historical-record and future-selection behavior before confirmation.
- **FR-009**: Merge presentation MUST make source and target unambiguous, state the reclassification and source-archive consequence, and require explicit confirmation.
- **FR-010**: Merge, archive, restore, and save MUST prevent duplicate submission and report completion only after the current command resolves.
- **FR-011**: Create and edit MUST preserve Arabic label, English label, parent, favorite, and existing icon/color values supported by the category record.
- **FR-012**: The form MUST present one dominant Save action, persistent labels, keyboard-safe content, and compact selection for parent hierarchy.
- **FR-013**: Validation MUST identify the exact field or relationship, preserve valid input, and leave category data unchanged on failure.
- **FR-014**: Meaningful form input MUST be protected against accidental loss according to approved existing navigation behavior.
- **FR-015**: Selection mode MUST prioritize current, favorite, and recent choices where supplied, while retaining searchable access to every eligible active category.
- **FR-016**: Archived, merged, disabled, or otherwise ineligible categories MUST not be selectable and MUST expose an understandable reason where shown.
- **FR-017**: Selection mode MUST keep management commands secondary and MUST not interrupt the originating financial task.
- **FR-018**: Existing inline or contextual creation paths MUST preserve the caller's draft and return the saved category using current picker semantics where supported.
- **FR-019**: Selecting, creating, or cancelling MUST preserve caller route, draft, filter, scroll, and sibling proposal state.
- **FR-020**: Loading states MUST preserve expected geometry; empty, no-result, missing, error, offline failure where mapped, and success states MUST state the valid next action.
- **FR-021**: R03 MUST NOT invent category freshness or synchronization status that the current category contract does not supply; transport/storage failures use the existing error and retry behavior.
- **FR-022**: Arabic RTL and English LTR MUST expose identical category fields, states, consequences, and actions.
- **FR-023**: Mixed Arabic/English labels, merchant-related content, digits, and punctuation MUST remain intentionally ordered and readable.
- **FR-024**: Directional navigation and disclosure icons MUST mirror where meaning requires it; category icons MUST not mirror merely because the locale changes.
- **FR-025**: Category rows, controls, and actions MUST meet the 44-by-44-point minimum target and remain operable at 200% text and with screen readers.
- **FR-026**: Screen readers MUST receive category label, kind, hierarchy, favorite/selection, status, availability, and action in logical task order.
- **FR-027**: Status, hierarchy, selection, favorite, warning, and merge meaning MUST NOT depend only on color, icon, animation, or haptics.
- **FR-028**: Motion MUST be brief and preserve origin context; reduced-motion mode MUST provide equivalent state feedback without nonessential movement.
- **FR-029**: R03 MUST reuse R01 grouped rows, icon container, forms, picker/overlay, confirmation, state feedback, semantic tokens, and direction/accessibility contracts.
- **FR-030**: R03 MUST introduce no business calculation, category rule, route, permission, provider, or production data source.
- **FR-031**: Downstream validation MUST cover R04 Transactions, R05 Add, R06 Tracking, R09 Budgets, R12 Reports, and R13 Assistant wherever they consume category identity or selection.

### Constitution Requirements *(mandatory)*

- **Platform behavior**: Category management and selection remain equivalent on Android and iOS, preserve protected navigation and manual fallback, and introduce no permission or platform claim.
- **Financial trust**: Archive and merge consequences are explicit; no reclassification or financial effect occurs before the existing confirmed command, and failures never display false success.
- **Localization and accessibility**: Arabic RTL and English LTR have full field/action parity, visible labels, intentional mixed-direction content, screen-reader semantics, 200% text, keyboard safety, reduced motion, and minimum targets.
- **UI states and tokens**: R01 semantic roles govern category identity, selection, status, loading, empty, error, offline, pending, confirmation, and success presentations.
- **Verification**: Each management, detail/form, and picker surface requires focused behavioral regression and real-device evidence before R03 closes.

### Shared Dependencies

- **R01**: grouped rows, navigation/header, forms, searchable picker/overlay, confirmation, state feedback, semantic tokens, icon containers, motion, direction, and accessibility.
- **R04/R05**: transaction and Add/voice callers consume category presentation and selection; they do not own category rules.
- **Feature-owned data**: existing category queries, validation, hierarchy, archive/restore, merge, and transaction-reclassification behavior remain authoritative.
- **Downstream consumers**: R04 Transactions, R05 Add, R06 Tracking, R09 Budgets, R12 Reports, and R13 Assistant require regression validation when the category row or picker contract changes.

### Key Entities

- **Category**: An existing system or custom financial classification with Arabic/English labels, hierarchy, visual metadata, favorite state, active/archive/merge state, and optional merge target.
- **Category Selection**: A current or candidate eligible category with search, favorite/recent context, caller origin, and select/cancel/create return outcome.
- **Category Merge Decision**: A consequential source-to-target reclassification choice with explained historical and future effects and a confirmed result.
- **Category Draft**: Bilingual labels and category settings entered during create/edit that remain until saved or deliberately discarded.

## State Matrix

| Screen | Required states |
|---|---|
| Category list | initial/loading, no custom categories, typical, dense, search no results, system/custom, favorite, archived, merged, error/retry, offline failure where mapped |
| Category detail | loading, missing, error/retry, active, archived, merged, system-restricted where applicable, action working/failure/success |
| Create category | ready, keyboard open, valid, required/relationship validation, allowed duplicate labels, saving, success, failure/retry, unsaved draft |
| Edit category | loading, missing, error/retry, ready, validation, allowed duplicate labels, saving, success/failure, unsaved draft, parent changed/ineligible |
| Merge/archive decision | source/target review, confirmation, working, changed target, failure/retry, success |
| Category picker | loading, typical, dense, current selection, favorite/recent, search no results, no eligible categories, ineligible state, create-and-return, cancel, error |

## Trust, Privacy, Localization, and Accessibility

- Labels and hierarchy are not generally sensitive, but transaction-linked usage, merchant context, and caller drafts retain existing privacy treatment.
- Merge/archive feedback states exactly what changed and never exposes transaction detail not already authorized on the current route.
- Arabic and English expose the same category identity, fields, consequences, validation, and recovery; both labels remain stored without forcing both to fit one visual line.
- Screen-reader order follows category identity → origin/hierarchy/status → available action; hidden caller values remain hidden.
- Category colors satisfy contrast where used but do not carry category identity or status alone.
- At 200% text, rows and forms reflow, selection controls may stack, and no action or label clips.

## Navigation and Connections

- Category management retains its current entry points from Home and any existing feature-owned links.
- Picker mode remains owned by R03 even when opened by R04, R05, R06, R09, R12, or R13.
- Creating from a picker uses the current create capability and returns safely to the origin where the caller supports it; it does not create a new global route.
- Back/cancel/select preserves the caller's draft, query, filters, scroll, sibling proposal edits, and tab context.
- Protected-route and privacy gates remain owned by the shell; R03 supplies no bypass or duplicate gate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of users find a requested category in a 150-category catalogue within 20 seconds using Arabic or English search.
- **SC-002**: At least 90% of users correctly identify category label, system/custom origin, favorite state, hierarchy, and availability within 10 seconds.
- **SC-003**: At least 90% of users create or edit a valid bilingual category within 90 seconds, and 100% of invalid attempts retain all valid entered values.
- **SC-004**: 100% of archive and merge tests correctly identify source, target, historical effect, future-selection effect, and exact completion or failure before leaving the decision surface.
- **SC-005**: 100% of tested picker select, cancel, and create-return journeys preserve the originating draft, filters, and sibling state.
- **SC-006**: All owned screens complete critical journeys in Arabic RTL and English LTR, light and dark themes, at 200% text, on the smallest supported phone, with zero clipped labels or targets below 44 by 44 points.
- **SC-007**: Screen-reader and grayscale review finds complete category identity, hierarchy, selection, status, and action meaning with zero reliance on color or icon alone.
- **SC-008**: Regression validation finds zero changes to category data, hierarchy, validation, assignment, archive/restore, merge effects, routes, or picker return semantics.

## Assumptions

- The approved compatible-redesign direction and R03 roadmap ownership remain unchanged.
- R01 shared presentation contracts are approved before R03 implementation.
- Existing category data, bilingual labels, validation, hierarchy, merge/archive commands, and downstream classification effects remain authoritative.
- Recent choices are shown only if existing feature data supplies them; favorites remain the current reliable prioritization fallback.
- Contextual category creation reuses existing creation capability and requires caller context preservation rather than a new product capability.
- Real-device validation and validation-fix tasks will be detailed during `/tasks`; this `/specify` phase changes no production code.

## 2026-09-05 Remediation Requirement

Custom-category archive and merge fetch the current authoritative linked
transaction count before showing confirmation. The count is visible in Arabic
and English; a stale preview fails without mutation. System categories display
no lifecycle controls. Archive does not reclassify; merge reclassifies all linked
transactions atomically. No separate undo or bulk action is introduced.
