import { expect, test } from "@playwright/test";
import { freshPhone, signIn } from "./helpers";

const OPS_PHONE = "9900000002";

test("ops onboards a kitchen and its first delicacy, then takes it live", async ({
  page,
}, info) => {
  const run = `${Date.now().toString(36)}${info.project.name[0]}`;
  const kitchenName = `Charminar Test Kitchen ${run}`;
  const sweetName = `Badam ki Jaali ${run}`;

  await page.goto("/ops/kitchens/new");
  await signIn(page, OPS_PHONE);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Add a kitchen" })).toBeVisible();

  // Nothing filled in: one focused summary that links to the problems.
  await main.getByRole("button", { name: "Continue" }).click();
  const summary = main.getByRole("alert").filter({ hasText: "There's a problem" });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Enter the kitchen's name.");

  await main.getByLabel("Kitchen name").fill(kitchenName);
  await main.getByLabel("City").selectOption({ label: "Hyderabad" });
  await main.getByLabel("Established").fill("1952");
  await main.getByRole("button", { name: "Continue" }).click();

  await expect(main.getByText("Step 2 of 4")).toBeVisible();
  await main.getByLabel("Pickup pincode").fill("500001");
  await main.getByLabel("Address", { exact: true }).fill("22-1-1, Pathargatti");
  await main.getByLabel("Dispatch contact").fill("Dispatch desk");
  await main.getByLabel("Contact mobile").fill("9849012345");
  await main.getByLabel("FSSAI licence no.").fill("13619000000789");
  await main.getByLabel("Licence valid until").fill("2030-03-31");
  await main.getByRole("button", { name: "Continue" }).click();

  await expect(main.getByText("Step 3 of 4")).toBeVisible();
  await expect(main.getByRole("button", { name: "Sun" })).toHaveAttribute("aria-pressed", "false");
  await main.getByRole("button", { name: "Continue" }).click();

  await expect(main.getByText("Step 4 of 4")).toBeVisible();
  await main.getByLabel("Owner's name").fill("Test Owner");
  await main.getByLabel("Owner's mobile").fill(freshPhone());
  await expect(main.getByText(/Mon–Sat · orders close 18:00/)).toBeVisible();
  await main.getByRole("button", { name: "Add kitchen" }).click();

  // The kitchen exists but can't go live without something to sell.
  await expect(main.getByRole("heading", { level: 1, name: kitchenName })).toBeVisible();
  await expect(main.getByText("1 thing left")).toBeVisible();
  await expect(main.getByRole("button", { name: "Go live" })).toBeDisabled();

  await main.getByRole("link", { name: "Add a delicacy" }).first().click();
  await expect(main.getByRole("heading", { level: 1, name: "Add a delicacy" })).toBeVisible();
  await main.getByLabel("Name", { exact: true }).fill(sweetName);
  await main.getByLabel("Category").selectOption({ label: "Mithai" });
  await main.getByLabel("One-line description").fill("Almond lattice from the Nizam's kitchens.");
  await main.getByLabel("Shelf life (hours)").fill("240");
  await main.getByLabel("Fresh on arrival (hours)").fill("80");
  await main.getByLabel("HSN code").fill("1704");
  await main.getByLabel("Ingredients").fill("Almonds, sugar, silver leaf");
  await main.getByLabel("Storage").fill("Cool, dry place");
  await main.getByLabel("Label", { exact: true }).fill("Box of 6");
  await main.getByLabel("Price (₹, incl. GST)").fill("450");
  await main.getByLabel("Net weight (g)").fill("250");
  await main.getByLabel("Packed weight (g)").fill("420");

  // The planner says where it can reach before anything goes on sale.
  const reach = main.getByRole("region", { name: "Where it can reach fresh" });
  await expect(reach.getByText(/of \d+ cities from Hyderabad/)).toBeVisible();
  await expect(reach.getByRole("listitem").filter({ hasText: "Bengaluru" })).toContainText("by ");

  await main.getByRole("button", { name: "Save as draft" }).click();
  await expect(main.getByRole("heading", { level: 1, name: kitchenName })).toBeVisible();
  await main
    .getByRole("listitem")
    .filter({ hasText: sweetName })
    .getByRole("button", { name: "Put on sale" })
    .click();
  await expect(main.getByText("Ready to go live")).toBeVisible();
  await main.getByRole("button", { name: "Go live" }).click();
  await expect(main.getByRole("button", { name: "Pause kitchen" })).toBeVisible();

  // Shoppers in Bengaluru can now order it, with real delivery dates.
  await page
    .context()
    .addCookies([{ name: "fd_pin", value: "560038", url: "http://localhost:3000" }]);
  await main.getByRole("link", { name: /View on the storefront/ }).click();
  await expect(page).toHaveURL(/\/kitchens\/charminar-test-kitchen-/);
  await expect(page.getByRole("heading", { level: 1, name: kitchenName })).toBeVisible();
  await expect(page.getByRole("link", { name: sweetName })).toBeVisible();
  await expect(page.getByText(/Arrives by/).first()).toBeVisible();
});

test("ops edits a route from a dialog", async ({ page }) => {
  await page.goto("/ops/routes");
  await signIn(page, OPS_PHONE);
  const main = page.getByRole("main");
  await main.getByLabel("From", { exact: true }).selectOption({ label: "Hyderabad" });
  await expect(main.getByRole("heading", { name: "From Hyderabad" })).toBeVisible();

  await main.getByRole("button", { name: "Add route" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a route" });
  await dialog.getByRole("button", { name: "Add route" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "There's a problem" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await main
    .getByRole("button", { name: /^Edit Hyderabad to Bengaluru/ })
    .first()
    .click();
  const edit = page.getByRole("dialog", { name: "Edit route" });
  await edit.getByLabel("Pickup by").fill("15:30");
  await edit.getByRole("button", { name: "Save route" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText(/Hyderabad → Bengaluru saved for \d+ pincodes/)).toBeVisible();
  await expect(main.getByText(/Pickup by 15:30/).first()).toBeVisible();
});
