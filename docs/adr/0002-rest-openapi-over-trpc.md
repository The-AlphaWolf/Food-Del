# ADR 0002: Versioned REST + OpenAPI (Hono) rather than tRPC

- **Status:** Accepted
- **Date:** 2026-10-09

## Context
Clients are the web app now, native apps in Phase 2, and later courier/payment webhooks and corporate-gifting partners. Mobile builds stay installed for months, so an API change can't break old clients.

## Decision
- Build the API in Hono with `@hono/zod-openapi` under `/api/v1`. Request and response schemas are hand-written Zod contracts in `packages/domain/contracts`.
- Changes within `/v1` are additive only. Clients send `X-Client-Version`.
- The Hono app is a library (`packages/api`) mounted inside Next.js for Phase 1. It can be deployed standalone (`apps/api-server`) without code changes.

## Consequences
- An OpenAPI document is generated for free. Typed clients are shared by web and mobile (`packages/api-client`).
- There is slightly more ceremony than tRPC, which is accepted for version safety.
