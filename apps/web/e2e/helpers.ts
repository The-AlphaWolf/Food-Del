import { expect, type Page } from "@playwright/test";

/** A fresh Indian mobile number per run so journeys never collide. */
export function freshPhone(): string {
  return `9${String(Date.now()).slice(-9)}`;
}

export async function setPincode(page: Page, pincode: string) {
  await page.context().addCookies([
    {
      name: "fd_pin",
      value: pincode,
      url: page.url().startsWith("http") ? page.url() : "http://localhost:3000",
    },
  ]);
}

export async function signIn(page: Page, phone: string) {
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = (await page.locator("strong.tabular").first().textContent())?.trim() ?? "123456";
  await page.getByLabel(/Code sent to/).fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

export async function expectNoA11yBasics(page: Page) {
  // Every image-like SVG with a role has a name; every button has a name.
  const unnamedButtons = await page
    .locator("button:not([aria-label])")
    .evaluateAll((els) => els.filter((e) => !(e.textContent ?? "").trim()).length);
  expect(unnamedButtons).toBe(0);
}
