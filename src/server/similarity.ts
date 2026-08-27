import type { Album } from "@/domain/types";
import { normalizeText } from "@/domain/library";
import { getArtistReleaseGroups, getReleaseGroupDetail, searchCatalogArtists } from "@/server/musicbrainz";
import { getSimilarArtists, getSimilarRecordings, type ListenBrainzSimilarArtist, type ListenBrainzSimilarRecording } from "@/server/listenbrainz";

export interface SimilarArtistResult {
  artistMbid?: string;
  name: string;
  score: number;
  albumScore: number;
  artistScore: number;
  signals: Array<"album" | "artist">;
}

export interface AlbumSimilaritySearch {
  seed: {
    albumId: string;
    albumTitle: string;
    artistName: string;
    artistMbid: string;
    releaseGroupId?: string;
    recordingSeeds: number;
    strategy: "album+artist" | "artist";
  };
  results: SimilarArtistResult[];
}

type Candidate = {
  artistMbid?: string;
  name?: string;
  albumRaw: number;
  albumScore: number;
  artistScore: number;
};

function releaseYear(value?: string) {
  const year = Number(value?.slice(0, 4));
  return Number.isFinite(year) ? year : undefined;
}

function selectReleaseGroup(album: Album, releases: Awaited<ReturnType<typeof getArtistReleaseGroups>>) {
  const exact = releases.filter((release) => normalizeText(release.title) === normalizeText(album.title));
  if (!exact.length) return undefined;
  const targetYear = album.year;
  if (!targetYear || exact.length === 1) return exact[0];
  return [...exact].sort((a, b) => {
    const yearA = releaseYear(a.firstReleaseDate);
    const yearB = releaseYear(b.firstReleaseDate);
    return Math.abs((yearA ?? targetYear) - targetYear) - Math.abs((yearB ?? targetYear) - targetYear);
  })[0];
}

function spreadSeeds(recordingIds: string[], maxSeeds = 4) {
  const unique = [...new Set(recordingIds.filter(Boolean))];
  if (unique.length <= maxSeeds) return unique;
  const indexes = Array.from({ length: maxSeeds }, (_, index) => Math.round((index * (unique.length - 1)) / (maxSeeds - 1)));
  return [...new Set(indexes.map((index) => unique[index]!).filter(Boolean))];
}

function candidateKey(artistMbid: string | undefined, name: string | undefined) {
  if (artistMbid) return `mbid:${artistMbid}`;
  const normalized = normalizeText(name ?? "");
  return normalized ? `name:${normalized}` : undefined;
}

function aggregate(
  artistRows: ListenBrainzSimilarArtist[],
  recordingRows: ListenBrainzSimilarRecording[],
  seedArtistMbid: string,
  seedArtistName: string,
): SimilarArtistResult[] {
  const candidates = new Map<string, Candidate>();
  const artistMax = Math.max(0, ...artistRows.map((row) => row.score));

  for (const row of artistRows) {
    if (row.artistMbid === seedArtistMbid || row.score <= 0) continue;
    const key = candidateKey(row.artistMbid, row.name);
    if (!key) continue;
    const current = candidates.get(key) ?? { artistMbid: row.artistMbid, name: row.name, albumRaw: 0, albumScore: 0, artistScore: 0 };
    current.artistMbid ??= row.artistMbid;
    current.name ??= row.name;
    current.artistScore = artistMax > 0 ? Math.max(current.artistScore, row.score / artistMax) : 0;
    candidates.set(key, current);
  }

  const maxByReference = new Map<string, number>();
  for (const row of recordingRows) {
    const reference = row.referenceMbid ?? "album";
    maxByReference.set(reference, Math.max(maxByReference.get(reference) ?? 0, row.score));
  }

  for (const row of recordingRows) {
    const artistMbid = row.artistMbids[0];
    const name = row.artistName;
    if (artistMbid === seedArtistMbid || normalizeText(name ?? "") === normalizeText(seedArtistName)) continue;
    const key = candidateKey(artistMbid, name);
    if (!key) continue;
    const referenceMax = maxByReference.get(row.referenceMbid ?? "album") ?? 0;
    if (referenceMax <= 0) continue;
    const current = candidates.get(key) ?? { artistMbid, name, albumRaw: 0, albumScore: 0, artistScore: 0 };
    current.artistMbid ??= artistMbid;
    current.name ??= name;
    current.albumRaw += row.score / referenceMax;
    candidates.set(key, current);
  }

  const albumMax = Math.max(0, ...[...candidates.values()].map((candidate) => candidate.albumRaw));
  for (const candidate of candidates.values()) candidate.albumScore = albumMax > 0 ? candidate.albumRaw / albumMax : 0;
  const albumSignalAvailable = albumMax > 0;

  return [...candidates.values()]
    .filter((candidate): candidate is Candidate & { name: string } => Boolean(candidate.name))
    .map((candidate) => {
      const weighted = albumSignalAvailable
        ? candidate.albumScore * 0.68 + candidate.artistScore * 0.32
        : candidate.artistScore;
      const signals: SimilarArtistResult["signals"] = [];
      if (candidate.albumScore > 0) signals.push("album");
      if (candidate.artistScore > 0) signals.push("artist");
      return {
        artistMbid: candidate.artistMbid,
        name: candidate.name,
        score: Math.max(1, Math.min(100, Math.round(weighted * 100))),
        albumScore: Math.round(candidate.albumScore * 100),
        artistScore: Math.round(candidate.artistScore * 100),
        signals,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.albumScore - a.albumScore || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
    .slice(0, 24);
}

export async function findAlbumSimilarArtists(album: Album, artistName: string): Promise<AlbumSimilaritySearch> {
  const catalogArtists = await searchCatalogArtists(artistName);
  const exactArtist = catalogArtists.find((artist) => normalizeText(artist.name) === normalizeText(artistName));
  const seedArtist = exactArtist ?? catalogArtists[0];
  if (!seedArtist) throw new Error(`Artiste MusicBrainz introuvable : ${artistName}`);

  const [artistRows, releases] = await Promise.all([
    getSimilarArtists(seedArtist.id),
    getArtistReleaseGroups(seedArtist.id),
  ]);

  let releaseGroupId: string | undefined;
  let recordingSeeds: string[] = [];
  let recordingRows: ListenBrainzSimilarRecording[] = [];

  const releaseGroup = selectReleaseGroup(album, releases);
  if (releaseGroup) {
    releaseGroupId = releaseGroup.id;
    try {
      const release = await getReleaseGroupDetail(releaseGroup.id);
      recordingSeeds = spreadSeeds((release?.tracks ?? []).map((track) => track.recordingId).filter((id): id is string => Boolean(id)));
      if (recordingSeeds.length) recordingRows = await getSimilarRecordings(recordingSeeds);
    } catch {
      // Artist similarity remains a valid fallback if an album edition or recording dataset is temporarily unavailable.
      recordingSeeds = [];
      recordingRows = [];
    }
  }

  const results = aggregate(artistRows, recordingRows, seedArtist.id, seedArtist.name);
  return {
    seed: {
      albumId: album.id,
      albumTitle: album.title,
      artistName: seedArtist.name,
      artistMbid: seedArtist.id,
      releaseGroupId,
      recordingSeeds: recordingSeeds.length,
      strategy: recordingRows.length ? "album+artist" : "artist",
    },
    results,
  };
}