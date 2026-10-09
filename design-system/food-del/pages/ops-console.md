# Page override: ops console (`/ops/*`)

These rules override `MASTER.md` for the operations console. Everything else (colour, type, focus, voice) is inherited.

## Purpose
A work tool for a small ops team. It is used mostly on laptops, sometimes on a phone from a kitchen floor. Speed and clarity beat delight.

## Density
- Tighter than the storefront: 16px card padding on phones, 24px on desktop, 12px gaps between list rows.
- Numbers use `tabular-nums`. Hours are stated as hours ("usually 24 h, at most 36 h"), never as ranges of days.

## Onboarding flows
- **Kitchen:** a four-step wizard (The kitchen → Pickup & licence → Dispatch & terms → Owner & review). Editing shows the same sections on one page.
- **Kitchen page:** the go-live checklist comes first. Each unmet check links to the screen that fixes it. "Go live" stays disabled, with a hint, until every blocking check passes.
- **Delicacy:** a single page with sections and a sticky side panel: a live art preview, plus *where it can reach fresh*, which runs the real delivery-date planner once per destination city as the form changes.
- **Routes and cities:** added and edited in a dialog (native `<dialog>`: focus moves in, Escape closes, focus returns to the trigger).

## Payouts
- **Hero figure:** "Owed to kitchens" (one per view, ≥48px, sans, proportional figures), with four supporting stat tiles. The tiles are numbers, not charts.
- **Compact amounts:** in Indian units (₹1.3L, ₹5.2Cr) on tiles only, with the exact amount on hover and for screen readers. Tables show exact rupees in tabular figures.
- **Every payout says what happens next** in one line (when it pays, what's blocking it, or the provider id once paid), next to a status badge with an icon.
- **Actions sit on the row they affect:**
  - *Hold* (asks for a reason in a dialog, never a browser prompt)
  - *Resume*
  - *Retry*
  - *Link account* (goes to the kitchen's details)

## Status language
| Data | Shown as |
|---|---|
| Kitchen `ONBOARDING` / `ACTIVE` / `PAUSED` | Onboarding / Live / Paused |
| Delicacy `DRAFT` / `ACTIVE` / `PAUSED` / `ARCHIVED` | Draft / On sale / Paused / Archived |
| Job names | Plain verbs ("Lock batches at cutoff", "Send queued work"), not slugs |
| Payout states | Paid, In claim window, Waiting on a claim, Held for review, Needs payout account, Transfer pending / failed, Clawback pending, Clawed back |

## Don't
- Don't use raw enum values or slugs as labels.
- Don't hide a disabled action's reason: say what's missing next to it.
- Don't use colour alone for readiness: every check pairs an icon with an accessible name (Done / Needed / Recommended) and text.
