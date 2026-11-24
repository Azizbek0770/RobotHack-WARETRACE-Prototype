import { apiGet, apiPost } from "../../api/client";

export type InspectionResult = "PASS" | "FAIL";

export interface InspectionCreate {
  result: InspectionResult;
  checklist_answers?: Record<string, boolean>;
  damage_notes?: string;
  evidence_metadata?: Record<string, string>;
  evidence_checksum?: string;
  operator_actor: string;
}

export interface InspectionRead {
  id: string;
  hu_id: string;
  result: InspectionResult;
  checklist_answers: Record<string, boolean> | null;
  damage_notes: string | null;
  evidence_metadata: Record<string, string> | null;
  evidence_checksum: string | null;
  operator_actor: string;
  created_at: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validInspection(value: unknown): value is InspectionRead {
  if (!record(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.hu_id === "string" &&
    (value.result === "PASS" || value.result === "FAIL") &&
    (value.checklist_answers === null ||
      (record(value.checklist_answers) &&
        Object.values(value.checklist_answers).every(
          (answer) => typeof answer === "boolean",
        ))) &&
    (value.damage_notes === null ||
      typeof value.damage_notes === "string") &&
    (value.evidence_metadata === null ||
      (record(value.evidence_metadata) &&
        Object.values(value.evidence_metadata).every(
          (item) => typeof item === "string",
        ))) &&
    (value.evidence_checksum === null ||
      typeof value.evidence_checksum === "string") &&
    typeof value.operator_actor === "string" &&
    typeof value.created_at === "string"
  );
}

export async function createInspection(
  huId: string,
  input: InspectionCreate,
  signal?: AbortSignal,
): Promise<InspectionRead> {
  const value = await apiPost(
    `/handling-units/${encodeURIComponent(huId)}/inspection`,
    input,
  );
  if (!validInspection(value)) {
    throw new Error("Unexpected inspection API response");
  }
  void signal;
  return value;
}

export async function listInspections(
  huId: string,
  signal?: AbortSignal,
): Promise<InspectionRead[]> {
  const value = await apiGet(
    `/handling-units/${encodeURIComponent(huId)}/inspections`,
    signal,
  );
  if (!Array.isArray(value) || !value.every(validInspection)) {
    throw new Error("Unexpected inspection history API response");
  }
  return value;
}