
import { apiGet, apiPost } from "./client";
import type { Page } from "./warehouse";

export type HUStatus =
  | "RECEIVED"
  | "INSPECTION_REQUIRED"
  | "QUARANTINED"
  | "STORED"
  | "CLOSED";

export interface HandlingUnit {
  id: string;
  external_code: string;
  sku_id: string;
  bin_id: string | null;
  quantity: number;
  status: HUStatus;
  version: number;
  sku: { id: string; code: string; name: string };
  bin: { id: string; code: string } | null;
}

export interface WarehouseEvent {
  id: string;
  hu_id: string;
  event_type: "HU_CREATED" | "HU_MOVED";
  from_bin_id: string | null;
  to_bin_id: string | null;
  before_status: string | null;
  after_status: string;
  quantity: number;
  before_version: number | null;
  after_version: number;
  source_label: string;
  created_at: string;
}

export interface HUCreate {
  external_code: string;
  sku_id: string;
  quantity: number;
}

export interface HUMove {
  target_bin_id: string;
  expected_version: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function brief(value: unknown): boolean {
  return record(value) &&
    typeof value.id === "string" &&
    typeof value.code === "string";
}

function validHU(value: unknown): value is HandlingUnit {
  if (!record(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.external_code === "string" &&
    typeof value.sku_id === "string" &&
    (value.bin_id === null || typeof value.bin_id === "string") &&
    typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity >= 0 &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version >= 1 &&
    [
      "RECEIVED",
      "INSPECTION_REQUIRED",
      "QUARANTINED",
      "STORED",
      "CLOSED",
    ].includes(String(value.status)) &&
    brief(value.sku) &&
    record(value.sku) &&
    typeof value.sku.name === "string" &&
    (value.bin === null || brief(value.bin))
  );
}

function validEvent(value: unknown): value is WarehouseEvent {
  if (!record(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.hu_id === "string" &&
    ["HU_CREATED", "HU_MOVED"].includes(String(value.event_type)) &&
    (value.from_bin_id === null ||
      typeof value.from_bin_id === "string") &&
    (value.to_bin_id === null ||
      typeof value.to_bin_id === "string") &&
    (value.before_status === null ||
      typeof value.before_status === "string") &&
    typeof value.after_status === "string" &&
    typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity > 0 &&
    (value.before_version === null ||
      (typeof value.before_version === "number" &&
        Number.isSafeInteger(value.before_version) &&
        value.before_version >= 1)) &&
    typeof value.after_version === "number" &&
    Number.isSafeInteger(value.after_version) &&
    value.after_version >= 1 &&
    typeof value.source_label === "string" &&
    typeof value.created_at === "string"
  );
}

function parseItem<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): T {
  if (!guard(value)) {
    throw new Error("Unexpected handling-unit API response");
  }

  return value;
}

function parsePage<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): Page<T> {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(guard) ||
    !Number.isSafeInteger(value.page) ||
    !Number.isSafeInteger(value.page_size) ||
    !Number.isSafeInteger(value.total)
  ) {
    throw new Error("Unexpected paginated API response");
  }

  return value as unknown as Page<T>;
}

export async function listHandlingUnits(
  search = "",
  signal?: AbortSignal,
): Promise<Page<HandlingUnit>> {
  const params = new URLSearchParams({
    page_size: "100",
  });

  if (search) params.set("search", search);

  return parsePage(
    await apiGet(`/handling-units?${params}`, signal),
    validHU,
  );
}

export async function getHandlingUnit(
  id: string,
  signal?: AbortSignal,
): Promise<HandlingUnit> {
  return parseItem(
    await apiGet(
      `/handling-units/${encodeURIComponent(id)}`,
      signal,
    ),
    validHU,
  );
}

export async function getHUEvents(
  id: string,
  signal?: AbortSignal,
): Promise<Page<WarehouseEvent>> {
  return parsePage(
    await apiGet(
      `/handling-units/${encodeURIComponent(id)}/events?page_size=100`,
      signal,
    ),
    validEvent,
  );
}

export async function createHandlingUnit(
  input: HUCreate,
): Promise<HandlingUnit> {
  return parseItem(
    await apiPost("/handling-units", input),
    validHU,
  );
}

export async function moveHandlingUnit(
  id: string,
  input: HUMove,
): Promise<HandlingUnit> {
  return parseItem(
    await apiPost(
      `/handling-units/${encodeURIComponent(id)}/move`,
      input,
    ),
    validHU,
  );
}
