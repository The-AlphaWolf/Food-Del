import { expect, type Page, test } from "@playwright/test";

/**
 * The GitHub Pages demo end to end. Every tab in one browser shares the in-browser backend, so
 * the journey switches accounts by signing out and in rather than opening new browsers.
 */
const OPS_PHONE = "9900000002";

async function signIn(page: Page, phone: string) {
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel(/Code sent to/).fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

async function signOut(page: Page) {
  await page.goto("account/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: /taste of another city/i })).toBeVisible();
}

test("a shopper orders and ops picks it up, all inside the browser", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));

  // First visit: the backend starts in a service worker, then the real home page renders.
  await page.goto("");
  await expect(page.getByText(/Demo:.*runs in your browser/)).toBeVisible({ timeout: 60_000 });
  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { name: /taste of another city/i })).toBeVisible();
  await main.getByLabel("Deliver to pincode").fill("560038");
  await main.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Showing delivery dates for 560038")).toBeVisible();
  await expect(page.getByText(/Arrives by/).first()).toBeVisible();

  // A pre-built delicacy page, filled from the in-browser API.
  await page.goto("delicacy/nolen-gur-sandesh/");
  await expect(page.getByRole("heading", { level: 1, name: "Nolen Gur Sandesh" })).toBeVisible();
  const available = page.locator('[role="radio"][aria-disabled="false"]');
  await expect(available.first()).toBeVisible();
  await available.nth(1).click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.getByRole("link", { name: "Go to cart" }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();

  await signIn(page, "9812345670");
  await page.getByLabel("Recipient's name").fill("Meera Krishnan");
  await page.getByLabel("Recipient's mobile").fill("9876501234");
  await page.getByLabel("House, building, street").fill("14, 2nd Main, Indiranagar");
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.getByRole("button", { name: /\(test\)/ }).click();
  // The order page has no pre-built file: the 404 fallback renders it from the URL.
  await expect(page.getByRole("heading", { level: 1, name: "Confirmed" })).toBeVisible();
  const orderNumber = (await page.getByText(/^FD-/).first().textContent())?.trim() ?? "";
  expect(orderNumber).toMatch(/^FD-/);
  const orderUrl = page.url();

  // Ops sees it and moves it into the kitchen's batch.
  await signOut(page);
  page.on("dialog", (d) => d.accept("demo"));
  await page.goto("ops/parcels/");
  await signIn(page, OPS_PHONE);
  await page.getByLabel("Search").fill(orderNumber);
  const row = page.getByRole("row", { name: new RegExp(orderNumber) });
  await expect(row).toBeVisible();
  await row.getByLabel(`Move ${orderNumber}`).selectOption("BATCHED");
  await row.getByRole("button", { name: "Apply" }).click();
  await expect(row.getByText("In the kitchen's batch")).toBeVisible();

  await page.goto("ops/");
  await expect(page.getByRole("heading", { name: "System health" })).toBeVisible();

  // A direct visit to the order's URL works too (served by the 404 fallback).
  await signOut(page);
  await page.goto(orderUrl);
  await expect(page.getByRole("heading", { name: "Sign in to track your order" })).toBeVisible();
  expect(failures).toEqual([]);
});
