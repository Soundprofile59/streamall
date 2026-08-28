import { afterEach, describe, expect, it, vi } from "vitest";
import { searchYouTubeCatalog } from "./providers";
import { parseYouTubeMusicSearchPayload } from "./youtube-music";

function musicPayload(videoId = "ytm12345678") {
  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [{
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [{
                  musicShelfRenderer: {
                    title: { runs: [{ text: "Songs" }] },
                    contents: [{
                      musicResponsiveListItemRenderer: {
                        playlistItemData: { videoId },
                        thumbnail: {
                          musicThumbnailRenderer: {
                            thumbnail: { thumbnails: [{ url: "https://img.example/120.jpg" }, { url: "https://img.example/480.jpg" }] },
                          },
                        },
                        flexColumns: [
                          {
                            musicResponsiveListItemFlexColumnRenderer: {
                              text: { runs: [{ text: "Welcome Asylum", navigationEndpoint: { watchEndpoint: { videoId } } }] },
                            },
                          },
                          {
                            musicResponsiveListItemFlexColumnRenderer: {
                              text: {
                                runs: [
                                  {
                                    text: "Dystopik Asylum",
                                    navigationEndpoint: {
                                      browseEndpoint: {
                                        browseId: "UCartist",
                                        browseEndpointContextSupportedConfigs: {
                                          browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" },
                                        },
                                      },
                                    },
                                  },
                                  { text: " • " },
                                  {
                                    text: "Le Futur c’était mieux avant !",
                                    navigationEndpoint: {
                                      browseEndpoint: {
                                        browseId: "MPREalbum",
                                        browseEndpointContextSupportedConfigs: {
                                          browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" },
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        ],
                        fixedColumns: [{
                          musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: "3:42" }] } },
                        }],
                      },
                    }],
                  },
                }],
              },
            },
          },
        }],
      },
    },
  };
}

describe("YouTube Music discovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses canonical song metadata and videoId from a YouTube Music response", () => {
    const results = parseYouTubeMusicSearchPayload(musicPayload());
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "ytm12345678",
      provider: "youtube",
      title: "Welcome Asylum",
      artistName: "Dystopik Asylum",
      albumTitle: "Le Futur c’était mieux avant !",
      duration: 222,
      artwork: "https://img.example/480.jpg",
      providerMetadata: { discoveredVia: "youtube-music", youtubeMusic: true },
    });
  });

  it("uses YouTube Music plus videos.list without spending a search.list call", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://music.youtube.com/youtubei/v1/search")) {
        return new Response(JSON.stringify(musicPayload()), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
        return new Response(JSON.stringify({
          items: [{
            id: "ytm12345678",
            snippet: { title: "Welcome Asylum", channelTitle: "Dystopik Asylum - Topic", thumbnails: { high: { url: "https://img.example/high.jpg" } } },
            contentDetails: { duration: "PT3M42S" },
            status: { embeddable: true, madeForKids: false },
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await searchYouTubeCatalog("unique-dystopik-asylum-query", 10);

    expect(response.results[0]).toMatchObject({
      externalId: "ytm12345678",
      artistName: "Dystopik Asylum",
      providerMetadata: { discoveredVia: "youtube-music", embeddableVerified: true },
    });
    expect(response.status.message).toBe("YouTube Music");
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/youtube/v3/search"))).toBe(false);
  });
});
