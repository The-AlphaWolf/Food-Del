# apps/mobile (Phase 2)

The Expo (React Native) app. It is not started yet. It will reuse, unchanged:

- **`@food-del/domain`**: delivery-date engine, pricing, state machines and API contracts.
- **`@food-del/api-client`**: the typed `/api/v1` client and TanStack Query hooks, with Bearer tokens instead of the web's cookie.
- **`@food-del/design-tokens`**: colours, type and spacing, exported as a NativeWind preset.

Nothing on the server changes for mobile: `/api/v1` is additive-only, so older app builds keep working. See `docs/BLUEPRINT.md` §7 and ADR 0001.
