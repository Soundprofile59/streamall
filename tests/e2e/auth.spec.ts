import { expect, test } from "@playwright/test";
import { libraryFixture } from "../../src/test/fixtures";

test("prototype opens without a login gate", async ({ page, request }) => {
  const api = await request.get("/api/library");
  expect(api.status()).toBe(200);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("STREAMALL")).toBeVisible();
  await expect(page.getByRole("button", { name: /RANDOM/ })).toBeVisible();
});

test("library remains usable without authentication", async ({ page }) => {
  const fixture = libraryFixture(1);
  await page.route("**/api/library", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: fixture });
      return;
    }
    const body = route.request().postDataJSON() as { snapshot: typeof fixture };
    await route.fulfill({ json: body.snapshot });
  });
  await page.goto("/");
  await expect(page.getByText("STREAMALL")).toBeVisible();
  await expect(page.getByRole("button", { name: /RANDOM/ })).toBeVisible();
  await page.getByRole("button", { name: /Track 0/ }).click();
  await expect(page.getByRole("heading", { name: "Track 0", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: /RANDOM/ }).click();
  await expect(page.getByRole("heading", { name: "Track 0", level: 1 })).toBeVisible();
});
