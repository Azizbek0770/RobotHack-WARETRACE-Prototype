
import { apiGet } from "./client";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

export async function fetchBackendHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const result = await apiGet("/health", signal);

  if (
    typeof result !== "object" ||
    result === null ||
    !("status" in result) ||
    result.status !== "ok" ||
    !("service" in result) ||
    typeof result.service !== "string" ||
    !("version" in result) ||
    typeof result.version !== "string"
  ) {
    throw new Error("Unexpected backend health response.");
  }

  return {
    status: "ok",
    service: result.service,
    version: result.version,
  };
}
