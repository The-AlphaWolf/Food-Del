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

## Interaction & motion
- **Motion:** 150–220ms ease-out, with exits faster than entrances. Honour `prefers-reduced-motion` (the global CSS disables transitions).
- **Forms:**
  - visible labels
  - validate on blur
  - errors next to the field plus a focusable summary on submit
  - loading → success/error feedback on every submit
- **Disabled delivery dates:** reduced opacity, `not-allowed` cursor, and the reason shown on focus/tap (never a silent grey-out).
- **Focus:** 2px `focus` ring, always visible for keyboard users.

## Content voice
Plain, warm, specific. "Arrives by Thu, 16 Oct" not "ETA 2–3 days". Every error says what happened and what to do next.
