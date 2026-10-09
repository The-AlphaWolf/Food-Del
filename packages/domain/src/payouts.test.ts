import { describe, expect, it } from "vitest";
import { isReleasable, type PayoutFacts, payoutState } from "./payouts";

const now = new Date("2026-10-16T06:00:00Z");
const due: PayoutFacts = {
  status: "ON_HOLD",
  releaseAfter: new Date("2026-10-15T07:35:00Z"),
  now,
  heldReason: null,
  openClaim: false,
  accountLinked: true,
  transferred: true,
  transferFailed: false,
  reversalRecorded: false,
};

describe("payoutState", () => {
  it("releases a transferred payout once its claim window has closed", () => {
    expect(payoutState(due)).toBe("RELEASING");
    expect(isReleasable(due)).toBe(true);
  });

  it.each([
    [{ heldReason: "Quality complaint under review" }, "HELD_FOR_REVIEW"],
    [{ openClaim: true }, "WAITING_ON_CLAIM"],
    [{ accountLinked: false, transferred: false }, "NEEDS_PAYOUT_ACCOUNT"],
    [{ transferred: false, transferFailed: true }, "TRANSFER_FAILED"],
    [{ releaseAfter: new Date("2026-10-17T00:00:00Z") }, "IN_CLAIM_WINDOW"],
    [{ transferred: false }, "TRANSFER_PENDING"],
  ] as const)("never releases money that hasn't moved or may be owed back: %o", (patch, state) => {
    const f = { ...due, ...patch };
    expect(payoutState(f)).toBe(state);
    expect(isReleasable(f)).toBe(false);
  });

  it("puts a review hold ahead of every other reason", () => {
    expect(payoutState({ ...due, heldReason: "x", openClaim: true, accountLinked: false })).toBe(
      "HELD_FOR_REVIEW",
    );
  });

  it("shows a clawback as pending until the provider confirms the reversal", () => {
    expect(payoutState({ ...due, status: "REVERSED" })).toBe("REVERSAL_PENDING");
    expect(payoutState({ ...due, status: "REVERSED", reversalRecorded: true })).toBe("CLAWED_BACK");
    // Nothing was ever transferred, so there's nothing to take back.
    expect(payoutState({ ...due, status: "REVERSED", transferred: false })).toBe("CLAWED_BACK");
    expect(payoutState({ ...due, status: "RELEASED" })).toBe("RELEASED");
  });
});
