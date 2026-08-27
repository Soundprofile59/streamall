export type SourceRepairState = "idle" | "running" | "done" | "quota" | "error";

export type SourceRepairStatus = {
  day: string;
  state: SourceRepairState;
  attemptedAlbums: number;
  addedSources: number;
  lastRunAt?: string;
  message?: string;
};

export const SOURCE_REPAIR_STATUS_KEY = "streamall:source-repair-status:v1";
export const SOURCE_REPAIR_STATUS_EVENT = "streamall:source-repair-status";

export function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function readSourceRepairStatus(): SourceRepairStatus | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOURCE_REPAIR_STATUS_KEY) ?? "null") as Partial<SourceRepairStatus> | null;
    if (!parsed || typeof parsed.day !== "string" || typeof parsed.state !== "string") return undefined;
    return {
      day: parsed.day,
      state: ["idle", "running", "done", "quota", "error"].includes(parsed.state) ? parsed.state as SourceRepairState : "idle",
      attemptedAlbums: Number.isFinite(parsed.attemptedAlbums) ? Number(parsed.attemptedAlbums) : 0,
      addedSources: Number.isFinite(parsed.addedSources) ? Number(parsed.addedSources) : 0,
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
    };
  } catch {
    return undefined;
  }
}

export function writeSourceRepairStatus(status: SourceRepairStatus) {
  try {
    window.localStorage.setItem(SOURCE_REPAIR_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Status display remains best-effort if local storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<SourceRepairStatus>(SOURCE_REPAIR_STATUS_EVENT, { detail: status }));
}
