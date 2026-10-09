import { describe, expect, it } from "vitest";
import { ERASED, eraseShipTo, maskRecipient } from "./privacy";

describe("erasure", () => {
  it("keeps only what tax records need from an address", () => {
    expect(
      eraseShipTo({
        recipientName: "Ananya Rao",
        phone: "+919876543210",
        line1: "12, 4th Cross",
        line2: "Indiranagar",
        landmark: "Near CMH Road",
        pincode: "560038",
        cityName: "Bengaluru",
        stateCode: "KA",
      }),
    ).toEqual({
      recipientName: ERASED,
      phone: ERASED,
      line1: ERASED,
      line2: null,
      landmark: null,
      pincode: "560038",
      cityName: "Bengaluru",
      stateCode: "KA",
    });
  });

  it("masks old message recipients", () => {
    expect(maskRecipient("+919876543210")).toBe("••••••3210");
    expect(maskRecipient("ananya@example.com")).toBe("a•••@example.com");
    expect(maskRecipient("x")).toBe(ERASED);
  });
});
