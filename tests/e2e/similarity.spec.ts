import { expect, test } from "@playwright/test";
import { libraryFixture } from "../../src/test/fixtures";

const similarityFixture = {
  seed: {
    albumId: "album_0",
    albumTitle: "Album 0",
    artistName: "Artist 0",
    artistMbid: "00000000-0000-0000-0000-000000000001",
    releaseGroupId: "00000000-0000-0000-0000-000000000002",
    recordingSeeds: 4,
    strategy: "album+artist" as const,
  },
  results: [
    {
      artistMbid: "00000000-0000-0000-0000-000000000003",
      name: "µ-Ziq",
      score: 91,
      albumScore: 100,
      artistScore: 72,
      signals: ["album", "artist"] as const,
    },
    {
      artistMbid: "00000000-0000-0000-0000-000000000004",
      name: "Aphex Twin",
      score: 83,
      albumScore: 86,
      artistScore: 78,
      signals: ["album", "artist"] as const,
    },
  ],
};

test("R opens album-aware similarity results", async ({ page }) => {
  const fixture = libraryFixture(8);

  await page.route("**/api/library", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: fixture });
      return;
    }
    const body = route.request().postDataJSON() as { snapshot: typeof fixture };
    await route.fulfill({ json: body.snapshot });
  });

  await page.route("**/api/similarity**", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("albumId")).toBe("album_0");
    await route.fulfill({ json: similarityFixture });
  });

  await page.goto("/");
  const album = page.locator(".album-tile").filter({ hasText: "Album 0" }).first();
  await expect(album).toBeVisible();
  await album.hover();

  await album.getByRole("button", { name: "Rechercher des artistes similaires à Album 0" }).click();

  await expect(page.getByRole("dialog", { name: "Artistes similaires à Album 0" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Album 0", level: 2 })).toBeVisible();
  await expect(page.getByText("Album + artiste · 4 morceaux-sondes")).toBeVisible();
  await expect(page.getByRole("button", { name: /µ-Ziq/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Aphex Twin/ })).toBeVisible();
  await expect(page.getByText("91", { exact: true })).toBeVisible();
});