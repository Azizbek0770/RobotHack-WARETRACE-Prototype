
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/api/v1"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiGet(
  path: `/${string}`,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new ApiError(
      `API request failed (${response.status})`,
      response.status,
    );
  }

  return response.json() as Promise<unknown>;
}
