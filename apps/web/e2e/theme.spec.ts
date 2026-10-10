import { expect, test } from "@playwright/test";

test.describe("themes", () => {
  test.use({ colorScheme: "dark" });

  test("follows the device, remembers a choice and can go back to the device", async ({ page }) => {
    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    // Set before first paint: the server HTML has no theme, the head script adds it.
    await page.goto("/");
    expect(await theme()).toBe("dark");

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    expect(await theme()).toBe("light");
    await page.reload();
    expect(await theme()).toBe("light");
    await expect(page.getByRole("group", { name: "Appearance" }).getByLabel("Light")).toBeChecked();

    await page.getByRole("group", { name: "Appearance" }).getByText("System").click();
    expect(await theme()).toBe("dark");
    await page.reload();
    expect(await theme()).toBe("dark");
  });
});
