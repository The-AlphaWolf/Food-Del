import { expect, test } from "@playwright/test";
import { expectNoA11yBasics, freshPhone, signIn } from "./helpers";

test.describe("shopper journey", () => {
  test("checks a pincode and sees real delivery dates", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await expect(page.getByRole("heading", { name: /taste of another city/i })).toBeVisible();
    const main = page.getByRole("main");
    await main.getByLabel("Deliver to pincode").fill("302001");
    await main.getByRole("button", { name: "Check" }).click();
    await expect(main.getByRole("alert")).toContainText("don't deliver to this city yet");

    await main.getByLabel("Deliver to pincode").fill("560038");
    await main.getByRole("button", { name: "Check" }).click();
    await expect(page.getByText("Showing delivery dates for 560038")).toBeVisible();
    await expect(page.getByText(/Arrives by/).first()).toBeVisible();
    await expectNoA11yBasics(page);
  });

  test("orders a chilled sweet for a chosen date and pays", async ({ page }) => {
    // The content security policy must never block our own pages.
    const blocked: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) blocked.push(m.text());
    });
    await page
      .context()
      .addCookies([{ name: "fd_pin", value: "560038", url: "http://localhost:3000" }]);
    await page.goto("/delicacy/nolen-gur-sandesh");
    await expect(page.getByRole("heading", { level: 1, name: "Nolen Gur Sandesh" })).toBeVisible();
    await expect(page.getByText("FSSAI licence")).toBeVisible();

    // Pick the second available date in the calendar (a gifting date, not just the earliest).
    const available = page.locator('[role="radio"][aria-disabled="false"]');
    await expect(available.first()).toBeVisible();
    await available.nth(1).click();
    await expect(page.getByText(/Arriving /)).toBeVisible();
    await expect(page.getByText(/gel packs/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Add to cart/ }).click();
    await page.getByRole("link", { name: "Go to cart" }).click();

    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    await expect(page.getByText(/Parcel 1 · Bagbazar Mishti Ghar/)).toBeVisible();
    await expect(page.getByText("Cold chain").first()).toBeVisible();
    await page.getByRole("link", { name: "Checkout" }).click();

    await signIn(page, freshPhone());
    await page.getByLabel("Recipient's name").fill("Meera Krishnan");
    await page.getByLabel("Recipient's mobile").fill("9876501234");
    await page.getByLabel("House, building, street").fill("14, 2nd Main, Indiranagar");
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByText(/holding your items/)).toBeVisible();
    await page.getByRole("button", { name: /\(test\)/ }).click();

    await expect(page.getByText("Order confirmed — thank you!")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Confirmed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toBeVisible();
    expect(blocked).toEqual([]);
  });

  test("explains why a two-day sweet can't fly across the country", async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: "fd_pin", value: "560038", url: "http://localhost:3000" }]);
    await page.goto("/delicacy/kacha-golla");
    await expect(page.getByText("It wouldn't stay fresh all the way to you.")).toBeVisible();
  });
});
