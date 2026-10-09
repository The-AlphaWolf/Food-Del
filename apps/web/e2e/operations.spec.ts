import { expect, type Page, test } from "@playwright/test";
import { freshPhone, signIn } from "./helpers";

/** Dev accounts from the seed: ops desk and the Chandni Chowk kitchen owner. */
const OPS_PHONE = "9900000002";
const DELHI_KITCHEN_PHONE = "9900000105";

async function placePaidOrder(page: Page): Promise<string> {
  await page
    .context()
    .addCookies([{ name: "fd_pin", value: "560038", url: "http://localhost:3000" }]);
  await page.goto("/delicacy/kaju-katli");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.goto("/checkout");
  await signIn(page, freshPhone());
  await page.getByLabel("Recipient's name").fill("Arjun Mehta");
  await page.getByLabel("Recipient's mobile").fill("9811122233");
  await page.getByLabel("House, building, street").fill("7, Cunningham Road");
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.getByRole("button", { name: /\(test\)/ }).click();
  await expect(page.getByText("Order confirmed — thank you!")).toBeVisible();
  const orderNumber = (await page.locator("p.tabular").first().textContent())?.trim();
  expect(orderNumber).toMatch(/^FD-\d{6}-[0-9A-Z]{5}$/);
  return orderNumber!;
}

test("kitchen and ops take an order from payment to doorstep", async ({ browser }) => {
  const customer = await browser.newPage();
  const orderNumber = await placePaidOrder(customer);
  const orderUrl = customer.url().replace(/\?.*$/, "");

  // Ops locks the parcel into the kitchen's batch (normally the cutoff job does this).
  const ops = await browser.newPage();
  ops.on("dialog", (d) => d.accept("e2e"));
  await ops.goto("/ops/parcels");
  await signIn(ops, OPS_PHONE);
  await ops.getByLabel("Search").fill(orderNumber);
  const row = ops.getByRole("row", { name: new RegExp(orderNumber) });
  await expect(row).toBeVisible();
  await row.getByLabel(`Move ${orderNumber}`).selectOption("BATCHED");
  await row.getByRole("button", { name: "Apply" }).click();
  await expect(row.getByText("In the kitchen's batch")).toBeVisible();

  // The kitchen packs it; the courier is booked automatically.
  const kitchen = await browser.newPage();
  await kitchen.goto("/vendor");
  await signIn(kitchen, DELHI_KITCHEN_PHONE);
  await expect(kitchen.getByRole("heading", { name: "Chandni Chowk Halwai & Sons" })).toBeVisible();
  await kitchen
    .getByRole("link")
    .filter({ hasText: /[1-9]\d* parcels? ·/ })
    .first()
    .click();
  await expect(kitchen.getByRole("heading", { name: "Production sheet" })).toBeVisible();
  const parcel = kitchen.getByRole("listitem").filter({ hasText: orderNumber });
  await parcel.getByRole("button", { name: "Mark packed" }).click();
  await expect(parcel.getByRole("link", { name: /Label FD/ })).toBeVisible();

  // Ops plays the courier: pickup → linehaul → destination hub → out for delivery → delivered.
  await ops.reload();
  await ops.getByLabel("Search").fill(orderNumber);
  for (const step of [
    "Picked up by courier",
    "On its way to your city",
    "Arrived in your city",
    "Out for delivery",
    "Delivered",
  ]) {
    await row.getByRole("button", { name: `Courier: ${step}` }).click();
    await expect(row.getByText(step).first()).toBeVisible();
  }

  // The customer sees it delivered, with a way to report problems.
  await customer.goto(orderUrl);
  await expect(customer.getByRole("heading", { level: 1, name: "Completed" })).toBeVisible();
  await expect(customer.getByText("Something not right with this parcel?")).toBeVisible();
});
