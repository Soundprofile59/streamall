import { google, sheets_v4 } from "googleapis";
import { librarySnapshotSchema } from "@/domain/schema";
import { emptyLibrary, SCHEMA_VERSION, type LibrarySnapshot } from "@/domain/types";
import { RevisionConflictError, type LibraryRepository } from "@/domain/repository";

const ENTITY_TABS = ["Artists", "Albums", "Tracks", "Mixes", "Sources", "History"] as const;
const REQUIRED_TABS = ["Meta", ...ENTITY_TABS] as const;
const CACHE_MS = 30_000;

interface MetaRow {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  genres: string[];
  moods: string[];
  settings: LibrarySnapshot["settings"];
  counts: Record<(typeof ENTITY_TABS)[number], number>;
  recentOperationIds: string[];
}

type EntityTab = (typeof ENTITY_TABS)[number];

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!email || !key || !spreadsheetId) throw new Error("Google Sheets credentials are incomplete");
  return { email, key, spreadsheetId };
}

async function retry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = (error as { code?: number; response?: { status?: number } }).response?.status ?? (error as { code?: number }).code;
      if (![429, 500, 502, 503, 504].includes(Number(status)) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 120));
    }
  }
  throw lastError;
}

export class GoogleSheetsLibraryRepository implements LibraryRepository {
  #sheets: sheets_v4.Sheets;
  #spreadsheetId: string;
  #initialized = false;
  #cache?: { expiresAt: number; snapshot: LibrarySnapshot };

  constructor() {
    const { email, key, spreadsheetId } = credentials();
    const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    this.#sheets = google.sheets({ version: "v4", auth });
    this.#spreadsheetId = spreadsheetId;
  }

  async #initialize() {
    if (this.#initialized) return;
    const spreadsheet = await retry(() => this.#sheets.spreadsheets.get({ spreadsheetId: this.#spreadsheetId, fields: "sheets.properties.title" }));
    const existing = new Set(spreadsheet.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean));
    const missing = REQUIRED_TABS.filter((title) => !existing.has(title));
    if (missing.length) {
      await retry(() =>
        this.#sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.#spreadsheetId,
          requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
        }),
      );
    }
    this.#initialized = true;
  }

  async #readMeta(): Promise<MetaRow | undefined> {
    const response = await retry(() =>
      this.#sheets.spreadsheets.values.get({ spreadsheetId: this.#spreadsheetId, range: "Meta!A1", valueRenderOption: "UNFORMATTED_VALUE" }),
    );
    const raw = response.data.values?.[0]?.[0];
    return typeof raw === "string" && raw ? (JSON.parse(raw) as MetaRow) : undefined;
  }

  async load() {
    await this.#initialize();
    if (this.#cache && this.#cache.expiresAt > Date.now()) return structuredClone(this.#cache.snapshot);
    const meta = await this.#readMeta();
    if (!meta) {
      const initial = emptyLibrary();
      this.#cache = { expiresAt: Date.now() + CACHE_MS, snapshot: initial };
      return structuredClone(initial);
    }
    if (meta.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${meta.schemaVersion}`);
    const ranges = ENTITY_TABS.map((tab) => `${tab}!A2:B${Math.max(2, (meta.counts[tab] ?? 0) + 1)}`);
    const response = await retry(() =>
      this.#sheets.spreadsheets.values.batchGet({ spreadsheetId: this.#spreadsheetId, ranges, valueRenderOption: "UNFORMATTED_VALUE" }),
    );
    const decoded = Object.fromEntries(
      ENTITY_TABS.map((tab, index) => [
        tab,
        (response.data.valueRanges?.[index]?.values ?? []).map((row) => JSON.parse(String(row[1])) as unknown),
      ]),
    ) as Record<EntityTab, unknown[]>;
    const snapshot = librarySnapshotSchema.parse({
      schemaVersion: meta.schemaVersion,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
      artists: decoded.Artists,
      albums: decoded.Albums,
      tracks: decoded.Tracks,
      mixes: decoded.Mixes,
      sources: decoded.Sources,
      history: decoded.History,
      genres: meta.genres,
      moods: meta.moods,
      settings: meta.settings,
    });
    this.#cache = { expiresAt: Date.now() + CACHE_MS, snapshot };
    return structuredClone(snapshot);
  }

  async save(snapshot: LibrarySnapshot, expectedRevision: number, operationId: string) {
    await this.#initialize();
    const current = await this.#readMeta();
    const currentRevision = current?.revision ?? 0;
    if (current?.recentOperationIds.includes(operationId)) return this.load();
    if (currentRevision !== expectedRevision) throw new RevisionConflictError(currentRevision);
    const persisted = librarySnapshotSchema.parse({
      ...snapshot,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    });
    const rows: Record<EntityTab, unknown[]> = {
      Artists: persisted.artists,
      Albums: persisted.albums,
      Tracks: persisted.tracks,
      Mixes: persisted.mixes,
      Sources: persisted.sources,
      History: persisted.history,
    };
    const meta: MetaRow = {
      schemaVersion: SCHEMA_VERSION,
      revision: persisted.revision,
      updatedAt: persisted.updatedAt,
      genres: persisted.genres,
      moods: persisted.moods,
      settings: persisted.settings,
      counts: Object.fromEntries(ENTITY_TABS.map((tab) => [tab, rows[tab].length])) as MetaRow["counts"],
      recentOperationIds: [...(current?.recentOperationIds ?? []), operationId].slice(-50),
    };
    const data: sheets_v4.Schema$ValueRange[] = [
      { range: "Meta!A1", values: [[JSON.stringify(meta)]] },
      ...ENTITY_TABS.map((tab) => ({
        range: `${tab}!A1`,
        values: [["id", "json"], ...rows[tab].map((entity) => [(entity as { id: string }).id, JSON.stringify(entity)])],
      })),
    ];
    await retry(() =>
      this.#sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.#spreadsheetId,
        requestBody: { valueInputOption: "RAW", data },
      }),
    );
    this.#cache = { expiresAt: Date.now() + CACHE_MS, snapshot: persisted };
    return structuredClone(persisted);
  }
}
