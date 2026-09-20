# Mobile Card Color Hierarchy Design

## Scope

Apply the new surface hierarchy to the Masarifi mobile app only. Admin Web is out of scope. Preserve all behavior, data, copy, RTL/LTR layout, spacing, radii, financial semantics, and dark mode.

## Goal

Make white cards immediately distinguishable from the surrounding page while keeping Masarifi's calm dark-teal identity.

## Light-theme palette

| Role | Value | Use |
|---|---:|---|
| Page canvas | `#F6F7F5` | Screen and activity-sheet backgrounds |
| Card | `#FFFFFF` | Standard cards and grouped card containers |
| Inset | `#F1F5F3` | Secondary buttons, fields, and inset controls |
| Card border | `#D7E1DC` | One-pixel card outline |
| Subtle divider | `#E7E9E6` | Rows and internal separators |
| Primary text | `#10231F` | Titles and essential values |
| Secondary text | `#4B534E` | Descriptions and metadata |
| Brand anchor | `#103F37` | Hero, primary action, selection, and links |

The page neutral comes from the existing Gulf Premium design-system guidance. White stays pure white; it becomes visible through canvas contrast, a defined border, and a restrained card shadow rather than an off-white card fill.

## Card treatment

- Standard standalone cards use `#FFFFFF`, a one-pixel `#D7E1DC` border, an 18px radius, and the shared card elevation.
- The shared card elevation uses dark teal `#0B2F29`, 10% opacity, `{ width: 0, height: 4 }`, radius 12, and Android elevation 3.
- Grouped lists receive one card boundary around the group; individual rows use dividers and do not each cast a shadow.
- Inset controls remain `#F1F5F3` so they stay visibly subordinate to the white card.
- Financial income/expense colors, status colors, focus states, and selected states do not change.
- Financial-hero glass cards remain translucent because they sit on the dark-teal hero rather than the page canvas.
- Dark mode keeps its current charcoal hierarchy (`#111816` page and `#19231F` cards); it is regression-tested but not converted to white cards.

## Implementation boundary

The change starts in semantic tokens and shared primitives. Screen-local edits are limited to card-like surfaces that currently bypass those primitives with direct white or generic elevation values. Decorative white icons and text on dark brand surfaces remain untouched.

## Verification

- Token and primitive tests lock the light canvas, card, border, inset, and card-elevation values.
- Boundary checks confirm feature code continues to consume semantic colors.
- Visual checks cover Home, tracking/notification cards, accounts, transactions, reports, planning, settings/forms, overlays, Arabic RTL, English LTR, large text, and dark mode on Android.
