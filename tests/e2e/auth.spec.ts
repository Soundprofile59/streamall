import { expect, test } from "@playwright/test";
import { libraryFixture } from "../../src/test/fixtures";

test("unauthorized routes and library are protected", async ({ page, request }) => {
  const api = await request.get("/api/library");
  expect(api.status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("owner can sign in and open the private library", async ({ page }) => {
  const fixture = libraryFixture(1);
  await page.route("**/api/library", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: fixture });
      return;
    }
    const body = route.request().postDataJSON() as { snapshot: typeof fixture };
    await route.fulfill({ json: body.snapshot });
  });
  await page.goto("/login");
  const password = page.getByLabel("Mot de passe");
  await expect(password).toBeEnabled();
  await password.fill("e2e-password");
  await page.getByRole("button", { name: "Entrer" }).click();
  await expect(page.getByText("STREAMALL")).toBeVisible();
  await expect(page.getByRole("button", { name: /RANDOM/ })).toBeVisible();
  await page.getByRole("button", { name: /RANDOM/ }).click();
  await expect(page.getByRole("heading", { name: "Track 0", level: 1 })).toBeVisible();
});
