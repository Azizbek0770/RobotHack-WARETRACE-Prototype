import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { getHandlingUnitByCode, type HandlingUnit } from "../../api/handlingUnits";
import CameraCapture from "./CameraCapture";
import { decodePhoto, type DecodedCode } from "./api";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const VALID_HU_CODE = /^[A-Z0-9][A-Z0-9._-]{2,119}$/;

type Stage = "idle" | "decoding" | "choosing" | "looking-up" | "found" | "error";

function messageFrom(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "No handling unit matches that label. Check the label or register the package in Handling Units.";
  }
  return error instanceof Error ? error.message : "The operation failed.";
}

export default function IntakePage() {
  const [manualCode, setManualCode] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [codes, setCodes] = useState<DecodedCode[]>([]);
  const [record, setRecord] = useState<HandlingUnit | null>(null);
  const [error, setError] = useState("");
  const [cameraMessage, setCameraMessage] = useState("");
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  function newRequest(): AbortController {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    return controller;
  }

  async function lookup(value: string, controller = newRequest()) {
    const label = value.trim().toUpperCase();
    setRecord(null);
    setError("");
    setManualCode(label);
    if (!VALID_HU_CODE.test(label)) {
      setStage("error");
      setError("Invalid handling-unit code. Use 3–120 uppercase letters, digits, dots, underscores or hyphens (for example HU-0001).");
      return;
    }

    setStage("looking-up");
    try {
      const found = await getHandlingUnitByCode(label, controller.signal);
      if (controller.signal.aborted) return;
      setRecord(found);
      setStage("found");
    } catch (failure) {
      if (controller.signal.aborted) return;
      setStage("error");
      setError(messageFrom(failure));
    }
  }

  async function scanPhoto(file: File) {
    const controller = newRequest();
    setRecord(null);
    setCodes([]);
    setError("");
    setCameraMessage("");

    if (!(["image/png", "image/jpeg"].includes(file.type))) {
      setStage("error");
      setError("Use a PNG or JPEG image.");
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setStage("error");
      setError("Images must be nonempty and smaller than 3 MiB.");
      return;
    }

    setStage("decoding");
    try {
      const decoded = await decodePhoto(file, controller.signal);
      if (controller.signal.aborted) return;

      if (decoded.length === 0) {
        setStage("error");
        setError("No readable barcode or QR code found. Adjust lighting or use manual entry.");
        return;
      }

      setCodes(decoded);
      if (decoded.length === 1) {
        await lookup(decoded[0].value, controller);
      } else {
        setStage("choosing");
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      setStage("error");
      setError(messageFrom(failure));
    }
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodes([]);
    void lookup(manualCode);
  }

  const busy = stage === "decoding" || stage === "looking-up";

  return (
    <section className="warehouse-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">RECEIVING / S02-A2</span>
          <h1>Scan & Identify</h1>
          <p>Use a camera, upload a photo, or enter a handling-unit code to retrieve an existing warehouse record.</p>
        </div>
        <span className="planned-label">Identification only</span>
      </div>

      <div className="notice">
        Decoding a label is not a quality inspection. Scanning cannot create, move, approve or modify inventory.
      </div>

      <div className="intake-grid">
        <div>
          <div className="panel">
            <div className="panel-heading"><h2>Camera scanner</h2></div>
            <CameraCapture
              onPhoto={scanPhoto}
              onError={setCameraMessage}
              disabled={busy}
            />
            {cameraMessage && <p className="error-text" role="alert">{cameraMessage}</p>}
          </div>

          <div className="panel">
            <div className="panel-heading"><h2>Upload a label image</h2></div>
            <label className="field">
              <span>Upload PNG or JPEG image</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void scanPhoto(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="muted">Maximum 3 MiB. The image is processed by the existing FastAPI decoder and is not retained by this screen.</p>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-heading"><h2>Manual lookup</h2></div>
            <form className="intake-manual" onSubmit={submitManual}>
              <label className="field">
                <span>Handling-unit code</span>
                <input
                  type="text"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="HU-0001"
                  maxLength={120}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={busy}>Look up handling unit</button>
            </form>
          </div>

          {busy && (
            <div className="notice" role="status">
              {stage === "decoding" ? "Decoding image…" : "Looking up handling unit…"}
            </div>
          )}

          {stage === "choosing" && (
            <section className="panel" aria-label="Multiple detected labels">
              <h2>Multiple codes detected</h2>
              <p className="muted">Select the label you intend to identify. No lookup is performed automatically when multiple codes are present.</p>
              <div className="intake-code-options">
                {codes.map((item, index) => (
                  <button
                    type="button"
                    className="secondary-button"
                    key={`${item.value}-${item.symbology}-${index}`}
                    onClick={() => void lookup(item.value)}
                  >
                    {item.value} ({item.symbology})
                  </button>
                ))}
              </div>
            </section>
          )}

          {stage === "error" && error && (
            <div className="notice notice--error" role="alert">{error}</div>
          )}

          {stage === "found" && record && (
            <section className="panel" aria-label="Identified handling unit">
              <div className="panel-heading"><h2>Identified handling unit</h2><span>{record.status}</span></div>
              <dl className="intake-details">
                <div><dt>Label</dt><dd>{record.external_code}</dd></div>
                <div><dt>SKU</dt><dd>{record.sku.code}</dd></div>
                <div><dt>Product</dt><dd>{record.sku.name}</dd></div>
                <div><dt>Quantity</dt><dd>{record.quantity}</dd></div>
                <div><dt>Recorded bin</dt><dd>{record.bin?.code ?? "Unassigned"}</dd></div>
                <div><dt>Version</dt><dd>{record.version}</dd></div>
              </dl>
              <p className="muted">Read-only result from the warehouse API. Physical identity and package condition still require operator verification.</p>
            </section>
          )}

          {stage === "idle" && (
            <div className="notice">Scan or enter a label to identify an existing handling unit.</div>
          )}
        </div>
      </div>
    </section>
  );
}
