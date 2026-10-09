import { readFileSync } from "node:fs";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { freshPhone, signIn } from "./helpers";

const OPS_PHONE = "9900000002";
const DELHI_KITCHEN_PHONE = "9900000105";

async function token(request: APIRequestContext, phone: string): Promise<string> {
  await request.post("/api/v1/auth/otp", { data: { phone } });
  const r = await request.post("/api/v1/auth/verify", { data: { phone, code: "123456" } });
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { token: string }).token;
}

/**
 * A delivered katli parcel from Old Delhi, set up through the API: the screens on the way are
 * covered by the order-to-doorstep journey.
 */
async function deliveredParcel(request: APIRequestContext): Promise<string> {
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const [customer, ops, kitchen] = [
    await token(request, freshPhone()),
    await token(request, OPS_PHONE),
    await token(request, DELHI_KITCHEN_PHONE),
  ];
  const item = (await (await request.get("/api/v1/items/kaju-katli")).json()) as {
    variants: { id: string }[];
  };
  const placed = await request.post("/api/v1/orders", {
    headers: { ...as(customer), "Idempotency-Key": crypto.randomUUID() },
    data: {
      pincode: "560038",
      shipTo: { recipientName: "Kavya Iyer", phone: "9811122233", line1: "3, Lavelle Road" },
      lines: [{ variantId: item.variants[0]!.id, quantity: 1 }],
    },
  });
  expect(placed.ok()).toBe(true);
  const { order } = (await placed.json()) as {
    order: { id: string; orderNumber: string; shipments: { id: string }[] };
  };
  const shipmentId = order.shipments[0]!.id;
  expect(
    (await request.post(`/api/v1/dev/orders/${order.id}/pay`, { headers: as(customer) })).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`/api/v1/ops/shipments/${shipmentId}/transition`, {
        headers: as(ops),
        data: { to: "BATCHED", note: "e2e" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`/api/v1/vendor/shipments/${shipmentId}/pack`, {
        headers: as(kitchen),
        data: {},
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`/api/v1/dev/shipments/${shipmentId}/advance`, {
        headers: as(ops),
        data: { status: "DELIVERED" },
      })
    ).ok(),
  ).toBe(true);
  return order.orderNumber;
}

test("ops sees what a kitchen is owed, holds a payout and downloads a statement", async ({
  page,
}) => {
  const orderNumber = await deliveredParcel(page.request);

  await page.goto("/ops/payouts");
  await signIn(page, OPS_PHONE);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Payouts" })).toBeVisible();
  await expect(main.getByText("Owed to kitchens")).toBeVisible();
  await expect(main.getByRole("heading", { name: "By kitchen" })).toBeVisible();

  // Chandni Chowk has no Razorpay Route account, so nothing can be paid to it yet.
  await main.getByLabel("Search", { exact: true }).fill(orderNumber);
  const row = main.getByRole("listitem").filter({ hasText: orderNumber });
  await expect(row).toContainText("Needs payout account");
  await expect(row.getByRole("link", { name: "Link account" })).toBeVisible();

  // Hold it for review, with a reason, then lift the hold.
  await row.getByRole("button", { name: `Hold ${orderNumber} for review` }).click();
  const dialog = page.getByRole("dialog", { name: "Hold for review" });
  await dialog.getByRole("button", { name: "Hold payout" }).click();
  await expect(dialog.getByText("Say why")).toBeVisible();
  await dialog.getByLabel("Reason").fill("Customer sent photos of a dented box");
  await dialog.getByRole("button", { name: "Hold payout" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Held for review");
  await expect(row).toContainText("Customer sent photos of a dented box");
  await row.getByRole("button", { name: "Resume" }).click();
  await expect(row).toContainText("Needs payout account");

  // A statement finance can reconcile, one line per payout.
  await main.getByRole("button", { name: "Statement" }).click();
  const statement = page.getByRole("dialog", { name: "Download statement" });
  const download = page.waitForEvent("download");
  await statement.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^payouts-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await file.path())!, "utf8");
  expect(csv.split("\r\n")[0]).toContain("order_number,kitchen");
  expect(csv).toContain(orderNumber);
});
