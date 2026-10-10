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

*Revisited again on 10 October 2026 for themes:*
- *The skill's `--design-system` output was off-brand a third time (green e-commerce, Rubik/Nunito) and was rejected.*
- *Its dark-mode rules were adopted:*
  - *design light and dark together;*
  - *use tonal, desaturated variants, not inversion;*
  - *test contrast separately in each theme;*
  - *keep borders visible in both;*
  - *measure the modal scrim against the real background.*

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

| `field` | #A08770 | Borders that identify a form control (inputs, steppers, choice cards): 3:1 against the surface (WCAG 1.4.11). `line` / `line-strong` are for dividers and decoration only. |
| `art-*` | per temperature | Backdrops behind the illustrated delicacies |

Rule: colour never carries meaning alone. Diet marks, temperature and status always pair an icon with text.

## Themes: Light and Night
- **Night is the same shop after dark, not an inversion.**
  - Surfaces are warm near-black, never pure black: `paper` #16100B, `card` #251C15.
  - Text is cream: `ink` #F7ECDF.
  - Brand and status colours use lighter tonal versions: `jaggery` #E9A46B, `chilled` #6FCBDA, `success` #6BD394.
  - The primary button keeps its role, but its text turns dark (`on-jaggery` #1B0F07).
- **Same variable names in both themes.** Components use semantic classes only (`bg-card`, `text-ink`, `text-on-jaggery`) and never `text-white` or raw hex.
- **Tested in both themes.** `tokens.test.ts` checks every text pair the UI uses (26 pairs, at least 4.5:1) and the UI pairs (focus ring, egg mark and field border, at least 3:1) in each theme. A new token must be defined in both.
- **Choosing a theme:**
  - The device setting decides by default.
  - The header button switches light ↔ dark in one tap.
  - Footer → Appearance offers System / Light / Dark, including going back to following the device.
  - The choice is saved per browser.
- **No flash.** A tiny script in `<head>` sets `data-theme` on `<html>` before first paint. Without JavaScript, `prefers-color-scheme` still applies. Colour transitions are suppressed for the frame of a switch.
- **Details:**
  - `color-scheme` is set per theme, so native controls, scrollbars and date pickers follow.
  - The `theme-color` meta follows the theme.
  - Night's dialog scrim is stronger (65% black), because 45% brown didn't separate a dialog from a dark page.
  - Use the `dark:` variant only for things tokens can't express, such as swapping the sun/moon icon.

## Typography
- **Display:** Playfair Display (variable), weights 600–800, for page and section titles only.
- **Body / UI:** Karla (variable), weights 400–700, 16px base, line height 1.5. Use `tabular-nums` for prices and dates.
- **Fonts:** self-hosted via `@fontsource-variable` (no third-party font requests).
- **Hindi (Phase 1.5):** add Mukta or Hind as a Devanagari fallback.

## Layout & components
- Mobile-first breakpoints: 375 → 768 → 1024 → 1280. Content max width 1200px. No horizontal scroll.
- Touch targets ≥ 44×44px with 8px spacing. Bottom-anchored primary action on mobile checkout.
- **Cards:** white on paper, 1px `line` border, `rounded-lg`, `shadow-card` on hover only.
- **Product imagery:** illustrated SVG motifs (`ItemArt`) until photography lands. No stock photos, no emoji.
  - **One motif per delicacy:** 30 motifs, named for ops in `ART_LABELS`. No two seeded delicacies share artwork; a catalogue page of identical laddoos told shoppers nothing.
  - **Backdrop and accent lines follow the theme** (`art-*` tokens, `currentColor`) so the art doesn't glare in Night. The food keeps its real colours in both themes, as a photograph would.
- **Card eyebrow depends on context:** "From {city}" when browsing; the kitchen's name on a city page; the category on a kitchen page. Never repeat what the page already says.
- **City pages:** a hero with facts (delicacies, kitchens, oldest kitchen) and a mosaic of the city's art. Category headings show their count.
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
