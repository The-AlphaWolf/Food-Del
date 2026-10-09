# ADR 0003: Paise, IST and p90 promises

- **Status:** Accepted
- **Date:** 2026-10-09

## Decision
- **Money:** integer paise everywhere (database `integer`, API `number`, engine `Paise`). Prices are GST-inclusive, per Indian B2C convention.
- **Time:** instants are `timestamptz` / UTC `Date`. Business rules (cutoffs, dispatch days, delivery dates) are evaluated on IST wall-clock values. India has no DST, so IST arithmetic is a fixed +05:30 offset implemented in `packages/domain/src/time/ist.ts`, with no timezone library.
- **Promises:**
  - Feasibility and "arrives by" use p90 transit.
  - p50 is shown only as "usually arrives".
  - A parcel is promised only if, at its p90 arrival, every item still has `min_residual_hours` of shelf life and its packaging holds temperature for the journey plus a handling buffer.

## Consequences
- We under-promise on average and almost never deliver spoiled food. Property tests in `planner.property.test.ts` enforce these invariants for arbitrary inputs.
