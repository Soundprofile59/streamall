export interface CatalogArtist {
  id: string;
  name: string;
  sortName?: string;
  disambiguation?: string;
  country?: string;
  type?: string;
  score?: number;
}

export interface CatalogReleaseGroup {
  id: string;
  title: string;
  primaryType?: string;
  secondaryTypes: string[];
  firstReleaseDate?: string;
  artistName?: string;
  artwork?: string;
}

export interface CatalogTrack {
  position: number;
  number?: string;
  title: string;
  artistName: string;
  lengthMs?: number;
}

export interface CatalogReleaseDetail {
  releaseGroupId: string;
  releaseId: string;
  title: string;
  date?: string;
  country?: string;
  status?: string;
  artwork?: string;
  tracks: CatalogTrack[];
}

export type CatalogApiResponse =
  | { mode: "artists"; artists: CatalogArtist[] }
  | { mode: "releases"; releases: CatalogReleaseGroup[] }
  | { mode: "release"; release: CatalogReleaseDetail | null };
