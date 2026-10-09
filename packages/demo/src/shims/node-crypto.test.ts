import { createHmac as nodeHmac } from "node:crypto";
import { expect, it } from "vitest";
import { createHmac, sha256 } from "./node-crypto";

it("matches Node's SHA-256 and HMAC", () => {
  for (const msg of ["", "abc", "x".repeat(55), "y".repeat(64), "z".repeat(1000), "₹ ব্যাগ"]) {
    expect(createHmac("sha256", "secret").update(msg).digest("hex")).toBe(
      nodeHmac("sha256", "secret").update(msg).digest("hex"),
    );
  }
  const longKey = "k".repeat(100);
  expect(createHmac("sha256", longKey).update("m").digest("hex")).toBe(
    nodeHmac("sha256", longKey).update("m").digest("hex"),
  );
  expect(Buffer.from(sha256(new TextEncoder().encode("abc"))).toString("hex")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
