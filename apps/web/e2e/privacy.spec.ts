import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { freshPhone, signIn } from "./helpers";

test("a customer reads the privacy notice, downloads their data and deletes their account", async ({
  page,
}) => {
  const phone = freshPhone();
  await page.goto("/account");
  await expect(
    page.getByRole("main").getByRole("link", { name: "privacy notice" }),
  ).toHaveAttribute("href", "/privacy");
  await signIn(page, phone);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Your data" })).toBeVisible();
  // Signing in recorded the notice, so there's nothing to re-read.
  await expect(main.getByText("Our privacy notice has changed")).toBeHidden();

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "Download my data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^food-del-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync((await file.path())!, "utf8")) as {
    profile: { phone: string };
    privacyHistory: { kind: string }[];
  };
  expect(data.profile.phone).toBe(`+91${phone}`);
  expect(data.privacyHistory[0]?.kind).toBe("NOTICE_ACKNOWLEDGED");

  await main.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  const confirm = dialog.getByRole("button", { name: "Delete account" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Grievance Officer" })).toBeVisible();
});
