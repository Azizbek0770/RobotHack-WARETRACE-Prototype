import { apiUpload } from "../../api/client";

export interface DecodedCode {
  value: string;
  symbology: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDecodedCode(value: unknown): value is DecodedCode {
  return (
    isRecord(value) &&
    typeof value.value === "string" &&
    value.value.length > 0 &&
    value.value.length <= 256 &&
    typeof value.symbology === "string" &&
    value.symbology.length > 0
  );
}

/** Decodes pixels only; never creates or changes inventory. */
export async function decodePhoto(
  file: File,
  signal?: AbortSignal,
): Promise<DecodedCode[]> {
  const data = new FormData();
  data.append("image", file, file.name);
  const response = await apiUpload("/intake/decode", data, signal);

  if (
    !isRecord(response) ||
    !Array.isArray(response.codes) ||
    response.codes.length > 10 ||
    !response.codes.every(isDecodedCode)
  ) {
    throw new Error("Unexpected scan service response");
  }

  return response.codes;
}
