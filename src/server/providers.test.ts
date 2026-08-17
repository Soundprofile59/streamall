import { afterEach, describe, expect, it, vi } from "vitest";
import { searchProviders } from "./providers";

describe("provider search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports Jamendo application-level failures instead of a false LIVE state", async () => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "test-client");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            headers: { status: "failed", code: 11, error_message: "Application suspended" },
            results: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const response = await searchProviders("unique-suspended-app-query", ["jamendo"]);

    expect(response.results).toEqual([]);
    expect(response.providers).toEqual([
      { provider: "jamendo", status: "ERROR", message: "Application suspended" },
    ]);
  });
});
