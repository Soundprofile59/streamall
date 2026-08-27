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

/**
 * YouTube Data API daily quotas reset at midnight Pacific Time. Using that
 * calendar day here prevents reloads from bypassing Streamall's daily cap and
 * lets a new repair window start as soon as YouTube's quota resets.
 */
export function repairDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
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
