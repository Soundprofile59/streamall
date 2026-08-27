import { expect, test } from "@playwright/test";
import { libraryFixture } from "../../src/test/fixtures";

test("catalog Lire searches the fresh title and previews the matching result", async ({ page }) => {
  const fixture = libraryFixture(4);
  let searchedQuery = "";

  await page.route("**/api/library", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: fixture });
      return;
    }
    const body = route.request().postDataJSON() as { snapshot: typeof fixture };
    await route.fulfill({ json: body.snapshot });
  });

  await page.route("**/api/search**", async (route) => {
    searchedQuery = new URL(route.request().url()).searchParams.get("q") ?? "";
    await route.fulfill({
      json: {
        providers: [],
        results: [
          {
            externalId: "wrong-result",
            provider: "jamendo",
            kind: "track",
            title: "Unrelated Track",
            artistName: "Someone Else",
            url: "https://example.test/unrelated.mp3",
            providerMetadata: {},
          },
          {
            externalId: "tycho-to-everywhere-1",
            provider: "jamendo",
            kind: "track",
            title: "To Everywhere, Pt. 1",
            artistName: "Tycho",
            url: "https://example.test/tycho.mp3",
            providerMetadata: {},
          },
        ],
      },
    });
  });

  await page.goto("/");
  const search = page.getByLabel("Recherche multi-provider");
  await expect(search).toBeVisible();
  await search.fill("ancienne recherche");

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("streamall:preview-catalog-track", {
      detail: { artistName: "Tycho", title: "To Everywhere, Pt. 1" },
    }));
  });

  await expect.poll(() => searchedQuery).toBe("Tycho To Everywhere, Pt. 1");
  await expect(page.locator(".player-details h1")).toHaveText("To Everywhere, Pt. 1");
  await expect(page.locator(".player-details").getByText("Tycho", { exact: true })).toBeVisible();
  await expect(page.locator(".player-details .eyebrow")).toContainText("PRÉÉCOUTE");
  await expect(search).toHaveValue("ancienne recherche");
});
