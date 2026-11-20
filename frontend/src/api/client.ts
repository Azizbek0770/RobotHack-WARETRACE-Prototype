
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "/api/v1"
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readResponse(response: Response): Promise<unknown> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.ok
        ? "Server returned invalid JSON"
        : `HTTP ${response.status}`,
      response.status,
    );
  }

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    if (isRecord(data) && isRecord(data.error)) {
      if (typeof data.error.message === "string") {
        message = data.error.message;
      }
    }

    throw new ApiError(message, response.status);
  }

  return data;
}

export async function apiGet(
  path: `/${string}`,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
  });

  return readResponse(response);
}

export async function apiPost(
  path: `/${string}`,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readResponse(response);
}
