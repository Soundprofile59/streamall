import type { LibraryRepository } from "@/domain/repository";
import { GoogleSheetsLibraryRepository } from "./google-sheets";
import { MemoryLibraryRepository } from "./memory";

const globalRepositories = globalThis as typeof globalThis & { streamallMemoryRepository?: MemoryLibraryRepository };

export function getLibraryRepository(): LibraryRepository {
  const mode = process.env.STREAMALL_REPOSITORY ?? (process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? "sheets" : "memory");
  if (mode === "sheets") return new GoogleSheetsLibraryRepository();
  if (process.env.NODE_ENV === "production" && mode === "memory") {
    throw new Error("STREAMALL_REPOSITORY=memory is forbidden in production");
  }
  globalRepositories.streamallMemoryRepository ??= new MemoryLibraryRepository();
  return globalRepositories.streamallMemoryRepository;
}
