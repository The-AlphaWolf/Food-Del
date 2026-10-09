# ADR 0001: Monorepo with a pure, shared domain package

- **Status:** Accepted
- **Date:** 2026-10-09

## Context
Phase 1 ships a responsive web app and Phase 2 adds iOS/Android apps. Serviceability, pricing and order rules must be identical on every surface. If any of them is copied into the mobile app, it will drift.

## Decision
- Use a pnpm + Turborepo monorepo. Business rules live in `packages/domain` as dependency-free TypeScript (only `zod`).
- Biome's `noNodejsModules` rule keeps Node built-ins out of `packages/domain/src`, so the package runs in browsers and React Native (Hermes).
- I/O lives in `packages/core`.
- Package manifests enforce the import direction. pnpm's strict `node_modules` stops a package importing anything it doesn't declare.

## Consequences
- The mobile app imports `@food-del/domain`, `@food-del/api-client` and `@food-del/design-tokens` and nothing else, so no rewrite is needed.
- Internal packages are consumed as TypeScript source ("just-in-time" packages). There is no build step per package. Next.js transpiles them via `transpilePackages`.
