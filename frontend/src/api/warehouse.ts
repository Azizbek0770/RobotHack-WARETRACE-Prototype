
import { apiGet } from "./client";

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface Zone {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  kind: "RECEIVING" | "STORAGE" | "QUARANTINE";
}

export interface StorageBin {
  id: string;
  zone_id: string;
  code: string;
  grid_x: number;
  grid_y: number;
  is_accessible: boolean;
  capacity_units: number | null;
}

export interface SKU {
  id: string;
  code: string;
  name: string;
  unit_weight_g: string | number | null;
  length_mm: string | number | null;
  width_mm: string | number | null;
  height_mm: string | number | null;
  is_fragile: boolean;
}

export interface ExpectedInventory {
  id: string;
  bin_id: string;
  sku_id: string;
  expected_qty: number;
  source: string;
  revision: number;
  sku: { id: string; code: string; name: string };
  bin: { id: string; code: string };
}

type RecordValue = Record<string, unknown>;

function isObject(value: unknown): value is RecordValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDecimal(value: unknown): boolean {
  return value === null || isString(value) || isNumber(value);
}

function isWarehouse(value: unknown): value is Warehouse {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.code) &&
    isString(value.name) &&
    typeof value.is_active === "boolean"
  );
}

function isZone(value: unknown): value is Zone {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.warehouse_id) &&
    isString(value.code) &&
    isString(value.name) &&
    ["RECEIVING", "STORAGE", "QUARANTINE"].includes(
      String(value.kind),
    )
  );
}

function isBin(value: unknown): value is StorageBin {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.zone_id) &&
    isString(value.code) &&
    isNumber(value.grid_x) &&
    isNumber(value.grid_y) &&
    typeof value.is_accessible === "boolean" &&
    (value.capacity_units === null ||
      isNumber(value.capacity_units))
  );
}

function isSKU(value: unknown): value is SKU {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.code) &&
    isString(value.name) &&
    isDecimal(value.unit_weight_g) &&
    isDecimal(value.length_mm) &&
    isDecimal(value.width_mm) &&
    isDecimal(value.height_mm) &&
    typeof value.is_fragile === "boolean"
  );
}

function isBrief(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.code)
  );
}

function isSKUBrief(value: unknown): boolean {
  return (
    isBrief(value) &&
    isObject(value) &&
    isString(value.name)
  );
}

function isExpected(
  value: unknown,
): value is ExpectedInventory {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.bin_id) &&
    isString(value.sku_id) &&
    isNumber(value.expected_qty) &&
    isString(value.source) &&
    isNumber(value.revision) &&
    isSKUBrief(value.sku) &&
    isBrief(value.bin)
  );
}

function parsePage<T>(
  value: unknown,
  validate: (item: unknown) => item is T,
): Page<T> {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(validate) ||
    !isNumber(value.page) ||
    !isNumber(value.page_size) ||
    !isNumber(value.total)
  ) {
    throw new Error("Invalid warehouse API response.");
  }

  return value as unknown as Page<T>;
}

function parseList<T>(
  value: unknown,
  validate: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value) || !value.every(validate)) {
    throw new Error("Invalid warehouse API list.");
  }

  return value;
}

export async function getWarehouses(
  signal?: AbortSignal,
): Promise<Page<Warehouse>> {
  return parsePage(
    await apiGet("/warehouses?page_size=100", signal),
    isWarehouse,
  );
}

export async function getZones(
  warehouseId: string,
  signal?: AbortSignal,
): Promise<Zone[]> {
  return parseList(
    await apiGet(
      `/warehouses/${encodeURIComponent(warehouseId)}/zones`,
      signal,
    ),
    isZone,
  );
}

export async function getBins(
  zoneId: string,
  signal?: AbortSignal,
): Promise<StorageBin[]> {
  return parseList(
    await apiGet(
      `/zones/${encodeURIComponent(zoneId)}/bins`,
      signal,
    ),
    isBin,
  );
}

export async function getSKUs(
  signal?: AbortSignal,
): Promise<Page<SKU>> {
  return parsePage(
    await apiGet("/skus?page_size=100", signal),
    isSKU,
  );
}

export async function getExpectedInventory(
  warehouseId: string,
  signal?: AbortSignal,
): Promise<Page<ExpectedInventory>> {
  const query = new URLSearchParams({
    warehouse_id: warehouseId,
    page_size: "100",
  });

  return parsePage(
    await apiGet(`/inventory/expected?${query}`, signal),
    isExpected,
  );
}
