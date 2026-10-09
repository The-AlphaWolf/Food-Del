# Food-Del: Design System (Master)

> Source of truth for UI decisions. Page-specific overrides live in `pages/<page>.md`.
> Tokens are code: `packages/design-tokens/src/index.ts`. Tailwind v4 `@theme` CSS is generated from it, and the Expo app will consume the same object.

## Positioning
Heritage gifting, not hyper-local quick delivery. The interface should feel like a good food magazine and a trusted old sweet shop:
- **Warm:** cream paper, deep jaggery brown, saffron accents.
- **Unhurried:** generous whitespace, editorial serif headings.
- **Precise:** delivery dates, cutoffs and freshness are stated plainly, never hidden.

We deliberately avoid the orange-and-blue "food delivery app" look and glassy blur effects. Blur hurts performance on the mid-range Android phones most Indian shoppers use.

*Derived with the ui-ux-pro-max skill. Its generic suggestions ("Liquid Glass", "Vibrant & Block-based") didn't fit and were rejected. Its bakery palette (warm brown and cream) and culinary type pairing were adapted.*

*Revisited in October 2026 with the same skill:*
- *Its `--design-system` output again proposed off-brand styles (green/orange e-commerce, Amatic SC craft), so the brand system above stands.*
- *Its UX guidelines (focusable error summary, step progress, mobile tables, empty states, Focus Not Obscured, bottom navigation of five or fewer tabs) drove the navigation, list and form rules below.*

## Colour (semantic, WCAG AA verified in `tokens.test.ts`)
| Token | Hex | Use |
|---|---|---|
| `paper` / `paper-deep` | #FFF9F0 / #F7EBDA | Page background / bands |
| `ink` / `ink-soft` / `ink-muted` | #2A1609 / #5B4636 / #7A6453 | Text hierarchy |
| `jaggery` | #8A3B0C | Primary actions, links |
| `saffron` | #E39A2B | Highlights, badges (dark text on top) |
| `chilled` | #0F6E80 | Cold-chain status, chilled items |
| `veg` / `non-veg` / `egg` | #1B7A3A / #8B2A1A / #B7791F | FSSAI diet marks (always with label) |
| `success` / `warning` / `danger` / `info` | AA pairs with `*-soft` backgrounds | Status |

Rule: colour never carries meaning alone. Diet marks, temperature and status always pair an icon with text.

## Typography
- **Display:** Playfair Display (variable), weights 600–800, for page and section titles only.
- **Body / UI:** Karla (variable), weights 400–700, 16px base, line height 1.5. Use `tabular-nums` for prices and dates.
- **Fonts:** self-hosted via `@fontsource-variable` (no third-party font requests).
- **Hindi (Phase 1.5):** add Mukta or Hind as a Devanagari fallback.

## Layout & components
- Mobile-first breakpoints: 375 → 768 → 1024 → 1280. Content max width 1200px. No horizontal scroll.
- Touch targets ≥ 44×44px with 8px spacing. Bottom-anchored primary action on mobile checkout.
- **Cards:** white on paper, 1px `line` border, `rounded-lg`, `shadow-card` on hover only.
- **Product imagery:** illustrated SVG motifs per delicacy (`ItemArt`) until photography lands. No stock photos, no emoji.
- **Icons:** Lucide (stroke 1.75). Icon-only buttons always have an `aria-label`.

## Navigation
- **Phones (< 768px):** a bottom tab bar on shopping pages: Home, Browse, Orders, Cart and Account/Sign in. That's five tabs, the most a bottom bar should hold.
  - The active tab has an `aria-current="page"`, a heavier icon stroke and a top indicator.
  - The bar is opaque, sits above the home indicator (`env(safe-area-inset-bottom)`), and a spacer keeps the footer clear of it.
  - Checkout, the kitchen portal, the ops console and sign-in hide it. Checkout has its own bottom action; the portals have their own navigation.
- **Header on phones:** brand and delivery pincode only (account and cart move to the tab bar).
- `scroll-padding-top` and `scroll-padding-bottom` keep focused elements clear of the sticky header and the tab bar (WCAG 2.2 *Focus Not Obscured*).
- **Ops console:** a tab per area (Overview, Parcels, Claims, Kitchens, Routes, Cities, Calendar). Nested pages keep their section's tab active.

## Lists
- **Delicacy cards:** compact rows on phones (thumbnail beside the details) so a city's catalogue scans quickly; full cards from `sm` up.
- **One pincode prompt per list page**, not "set your pincode" repeated on every card.
- **Data-heavy ops lists** become cards on phones. If a table must stay a table, its first column is pinned while the rest scrolls sideways.
- **Every empty state** says why it's empty and offers the next action ("No exceptions — every parcel is on track", "Add the first route").

## Interaction & motion
- **Motion:** 150–220ms ease-out, with exits faster than entrances. Honour `prefers-reduced-motion` (the global CSS disables transitions).
- **Forms:**
  - visible labels; optional fields say "(optional)", required ones carry no asterisks
  - validate on blur or step change
  - errors next to the field (`aria-describedby`), plus an `ErrorSummary` on failed submit. The summary takes focus, links to each field, and keeps the inline errors in place.
  - loading → success/error feedback on every submit
  - long forms are split into steps with "Step 2 of 4" and named steps; only finished steps can be revisited
  - server problems that belong to a field (e.g. `PICKUP_OUTSIDE_CITY`) are shown on that field, and the form jumps back to its step
  - numeric inputs set `inputMode`; times use `type="time"`; dates use `type="date"`
- **Disabled delivery dates:** reduced opacity, `not-allowed` cursor, and the reason shown on focus/tap (never a silent grey-out).
- **Focus:** 2px `focus` ring, always visible for keyboard users.

## Content voice
Plain, warm, specific. "Arrives by Thu, 16 Oct" not "ETA 2–3 days". Every error says what happened and what to do next.
