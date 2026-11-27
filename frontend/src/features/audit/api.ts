import { apiGet, apiPost, apiUpload } from "../../api/client";

export type AuditClassification = "OPERATIONAL" | "SIMULATED";
export type AuditState = "OPEN" | "COMPARED";
export type ObservationSource =
  | "MANUAL"
  | "CSV"
  | "SCANNER"
  | "SIMULATED_AMR";
export type FindingType =
  | "MISSING"
  | "EXCESS"
  | "MATCH"
  | "UNREGISTERED_HU"
  | "MISPLACED_HU";
export type FindingState = "OPEN" | "REVIEWED" | "RESOLVED";
export type FindingActionType = "REVIEW" | "RESOLVE";

export interface AuditSession {
  id: string;
  warehouse_id: string;
  request_key: string;
  started_by: string;
  classification: AuditClassification;
  status: AuditState;
  snapshot_taken_at: string;
  created_at: string;
}

export interface AuditSnapshotItem {
  expected_inventory_id: string;
  bin_id: string;
  sku_id: string;
  expected_qty: number;
  revision: number;
}

export interface AuditSnapshot {
  audit_id: string;
  snapshot_taken_at: string;
  items: AuditSnapshotItem[];
}

export interface StockObservation {
  id: string;
  audit_id: string;
  bin_id: string;
  sku_id: string;
  observed_qty: number;
  source: ObservationSource;
  observed_by: string;
  source_device_id: string | null;
  source_event_id: string | null;
  source_observed_at: string | null;
  classification: AuditClassification;
  handling_unit_codes: string[];
  created_at: string;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  observation_id: string;
  idempotency_key: string;
  finding_type: FindingType;
  expected_qty: number | null;
  observed_qty: number | null;
  discrepancy_qty: number | null;
  handling_unit_code: string | null;
  registered_bin_id: string | null;
  status: FindingState;
  created_at: string;
}

export interface FindingAction {
  id: string;
  finding_id: string;
  action: FindingActionType;
  from_status: FindingState;
  to_status: FindingState;
  actor: string;
  note: string | null;
  created_at: string;
}

export interface AuditComparison {
  audit_id: string;
  status: AuditState;
  finding_count: number;
  counts_by_type: Record<FindingType, number>;
}

interface StartAuditRequest {
  warehouse_id: string;
  request_key: string;
  started_by: string;
  classification: AuditClassification;
}

interface CreateObservationRequest {
  bin_id: string;
  sku_id: string;
  observed_qty: number;
  observed_by: string;
  handling_unit_codes?: string[];
}

interface FindingActionRequest {
  action: FindingActionType;
  actor: string;
  note?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isAudit(value: unknown): value is AuditSession {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.warehouse_id) &&
    isString(value.request_key) &&
    isString(value.started_by) &&
    (value.classification === "OPERATIONAL" ||
      value.classification === "SIMULATED") &&
    (value.status === "OPEN" || value.status === "COMPARED") &&
    isString(value.snapshot_taken_at) &&
    isString(value.created_at)
  );
}

function isSnapshotItem(value: unknown): value is AuditSnapshotItem {
  return (
    isRecord(value) &&
    isString(value.expected_inventory_id) &&
    isString(value.bin_id) &&
    isString(value.sku_id) &&
    isNumber(value.expected_qty) &&
    isNumber(value.revision)
  );
}

function isSnapshot(value: unknown): value is AuditSnapshot {
  return (
    isRecord(value) &&
    isString(value.audit_id) &&
    isString(value.snapshot_taken_at) &&
    Array.isArray(value.items) &&
    value.items.every(isSnapshotItem)
  );
}

function isObservation(value: unknown): value is StockObservation {
  const isDeviceSource =
    isRecord(value) &&
    (value.source === "SCANNER" || value.source === "SIMULATED_AMR");
  const hasValidSourceMetadata = isDeviceSource
    ? isString(value.source_device_id) &&
      isString(value.source_event_id) &&
      isString(value.source_observed_at)
    : isRecord(value) &&
      value.source_device_id === null &&
      value.source_event_id === null &&
      value.source_observed_at === null;
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.audit_id) &&
    isString(value.bin_id) &&
    isString(value.sku_id) &&
    isNumber(value.observed_qty) &&
    ["MANUAL", "CSV", "SCANNER", "SIMULATED_AMR"].includes(
      String(value.source),
    ) &&
    isString(value.observed_by) &&
    hasValidSourceMetadata &&
    (value.classification === "OPERATIONAL" ||
      value.classification === "SIMULATED") &&
    Array.isArray(value.handling_unit_codes) &&
    value.handling_unit_codes.every(isString) &&
    isString(value.created_at)
  );
}

function isFinding(value: unknown): value is AuditFinding {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.audit_id) &&
    isString(value.observation_id) &&
    isString(value.idempotency_key) &&
    [
      "MISSING",
      "EXCESS",
      "MATCH",
      "UNREGISTERED_HU",
      "MISPLACED_HU",
    ].includes(String(value.finding_type)) &&
    (value.expected_qty === null || isNumber(value.expected_qty)) &&
    (value.observed_qty === null || isNumber(value.observed_qty)) &&
    (value.discrepancy_qty === null || isNumber(value.discrepancy_qty)) &&
    isNullableString(value.handling_unit_code) &&
    isNullableString(value.registered_bin_id) &&
    ["OPEN", "REVIEWED", "RESOLVED"].includes(String(value.status)) &&
    isString(value.created_at)
  );
}

function isFindingAction(value: unknown): value is FindingAction {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.finding_id) &&
    (value.action === "REVIEW" || value.action === "RESOLVE") &&
    ["OPEN", "REVIEWED", "RESOLVED"].includes(String(value.from_status)) &&
    ["OPEN", "REVIEWED", "RESOLVED"].includes(String(value.to_status)) &&
    isString(value.actor) &&
    isNullableString(value.note) &&
    isString(value.created_at)
  );
}

function parseList<T>(
  value: unknown,
  validate: (item: unknown) => item is T,
  label: string,
): T[] {
  if (!Array.isArray(value) || !value.every(validate)) {
    throw new Error(`Invalid ${label} response from WARETRACE API.`);
  }
  return value;
}

function parseOne<T>(
  value: unknown,
  validate: (item: unknown) => item is T,
  label: string,
): T {
  if (!validate(value)) {
    throw new Error(`Invalid ${label} response from WARETRACE API.`);
  }
  return value;
}

export async function listAudits(
  warehouseId: string,
  signal?: AbortSignal,
): Promise<AuditSession[]> {
  const query = new URLSearchParams({ warehouse_id: warehouseId });
  return parseList(
    await apiGet(`/audits?${query}`, signal),
    isAudit,
    "audit list",
  );
}

export async function getAudit(
  auditId: string,
  signal?: AbortSignal,
): Promise<AuditSession> {
  return parseOne(
    await apiGet(`/audits/${encodeURIComponent(auditId)}`, signal),
    isAudit,
    "audit",
  );
}

export async function startAudit(
  request: StartAuditRequest,
): Promise<AuditSession> {
  return parseOne(await apiPost("/audits", request), isAudit, "audit");
}

export async function getAuditSnapshot(
  auditId: string,
  signal?: AbortSignal,
): Promise<AuditSnapshot> {
  return parseOne(
    await apiGet(`/audits/${encodeURIComponent(auditId)}/snapshot`, signal),
    isSnapshot,
    "audit snapshot",
  );
}

export async function listObservations(
  auditId: string,
  signal?: AbortSignal,
): Promise<StockObservation[]> {
  return parseList(
    await apiGet(
      `/audits/${encodeURIComponent(auditId)}/observations`,
      signal,
    ),
    isObservation,
    "observation list",
  );
}

export async function recordManualObservation(
  auditId: string,
  request: CreateObservationRequest,
): Promise<StockObservation> {
  return parseOne(
    await apiPost(
      `/audits/${encodeURIComponent(auditId)}/observations`,
      request,
    ),
    isObservation,
    "observation",
  );
}

export async function importObservationCsv(
  auditId: string,
  file: File,
  observedBy: string,
): Promise<{ imported_count: number; observations: StockObservation[] }> {
  const form = new FormData();
  form.append("observed_by", observedBy);
  form.append("file", file);
  const value = await apiUpload(
    `/audits/${encodeURIComponent(auditId)}/observations/import`,
    form,
  );
  if (
    !isRecord(value) ||
    !isNumber(value.imported_count) ||
    !Array.isArray(value.observations) ||
    !value.observations.every(isObservation)
  ) {
    throw new Error("Invalid CSV import response from WARETRACE API.");
  }
  return {
    imported_count: value.imported_count,
    observations: value.observations,
  };
}

export async function compareAudit(
  auditId: string,
): Promise<AuditComparison> {
  const value = await apiPost(
    `/audits/${encodeURIComponent(auditId)}/compare`,
    {},
  );
  if (!isRecord(value) || !isRecord(value.counts_by_type)) {
    throw new Error("Invalid audit comparison response from WARETRACE API.");
  }
  const counts = value.counts_by_type;
  const count = (type: FindingType): number => {
    const result = counts[type];
    if (!isNumber(result)) {
      throw new Error("Invalid audit comparison response from WARETRACE API.");
    }
    return result;
  };
  if (
    !isString(value.audit_id) ||
    (value.status !== "OPEN" && value.status !== "COMPARED") ||
    !isNumber(value.finding_count)
  ) {
    throw new Error("Invalid audit comparison response from WARETRACE API.");
  }
  return {
    audit_id: value.audit_id,
    status: value.status,
    finding_count: value.finding_count,
    counts_by_type: {
      MISSING: count("MISSING"),
      EXCESS: count("EXCESS"),
      MATCH: count("MATCH"),
      UNREGISTERED_HU: count("UNREGISTERED_HU"),
      MISPLACED_HU: count("MISPLACED_HU"),
    },
  };
}

export async function listFindings(
  auditId: string,
  signal?: AbortSignal,
): Promise<AuditFinding[]> {
  return parseList(
    await apiGet(`/audits/${encodeURIComponent(auditId)}/findings`, signal),
    isFinding,
    "finding list",
  );
}

export async function recordFindingAction(
  auditId: string,
  findingId: string,
  request: FindingActionRequest,
): Promise<FindingAction> {
  return parseOne(
    await apiPost(
      `/audits/${encodeURIComponent(auditId)}/findings/${encodeURIComponent(
        findingId,
      )}/actions`,
      request,
    ),
    isFindingAction,
    "finding action",
  );
}

export async function listFindingActions(
  auditId: string,
  findingId: string,
  signal?: AbortSignal,
): Promise<FindingAction[]> {
  return parseList(
    await apiGet(
      `/audits/${encodeURIComponent(auditId)}/findings/${encodeURIComponent(
        findingId,
      )}/actions`,
      signal,
    ),
    isFindingAction,
    "finding action list",
  );
}