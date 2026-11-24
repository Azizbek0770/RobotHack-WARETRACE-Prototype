import { useEffect, useState, type FormEvent } from "react";

import {
  getHandlingUnit,
  listHandlingUnits,
  type HandlingUnit,
} from "../../api/handlingUnits";
import {
  createInspection,
  listInspections,
  type InspectionRead,
  type InspectionResult,
} from "./api";

export default function InspectionPage() {
  const [units, setUnits] = useState<HandlingUnit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<HandlingUnit | null>(null);
  const [history, setHistory] = useState<InspectionRead[]>([]);
  const [result, setResult] = useState<InspectionResult>("PASS");
  const [damageNotes, setDamageNotes] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceChecksum, setEvidenceChecksum] = useState("");
  const [sealChecked, setSealChecked] = useState(true);
  const [packageChecked, setPackageChecked] = useState(true);
  const [labelChecked, setLabelChecked] = useState(true);
  const [operatorActor, setOperatorActor] = useState(
    "DEVELOPMENT_ACTOR",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    listHandlingUnits("", controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setUnits(page.items);
          setSelectedId(page.items[0]?.id ?? "");
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load handling units",
          );
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const controller = new AbortController();
    Promise.all([
      getHandlingUnit(selectedId, controller.signal),
      listInspections(selectedId, controller.signal),
    ])
      .then(([unit, inspections]) => {
        if (!controller.signal.aborted) {
          setSelected(unit);
          setHistory(inspections);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load inspection state",
          );
        }
      });
    return () => controller.abort();
  }, [selectedId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selected) return;
    if (
      result === "PASS" &&
      (!sealChecked || !packageChecked || !labelChecked)
    ) {
      setError(
        "A passing inspection requires every checklist item to be checked.",
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const inspection = await createInspection(selectedId, {
        result,
        checklist_answers: {
          seal: sealChecked,
          package: packageChecked,
          label: labelChecked,
        },
        damage_notes: damageNotes.trim() || undefined,
        evidence_metadata: evidenceLabel.trim()
          ? { label: evidenceLabel.trim(), type: "development" }
          : undefined,
        evidence_checksum:
          evidenceChecksum.trim() || undefined,
        operator_actor: operatorActor.trim(),
      });
      setHistory((current) => [inspection, ...current]);
      setSelected((current) =>
        current
          ? {
              ...current,
              status:
                result === "PASS"
                  ? "INSPECTION_REQUIRED"
                  : "QUARANTINED",
              version: current.version + 1,
            }
          : current,
      );
      setSuccess(
        result === "PASS"
          ? "Inspection passed. Normal storage requires the updated handling-unit version."
          : "Inspection failed. The handling unit is quarantined.",
      );
    } catch (failure: unknown) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to record inspection",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="warehouse-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">RECEIVING / QUALITY CONTROL</span>
          <h1>Inspections</h1>
          <p>
            Record an explicit development inspection decision and
            append an auditable handling-unit event.
          </p>
        </div>
        <span className="planned-label">Operator decision required</span>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice notice--success" role="status">
          {success}
        </div>
      )}

      <div className="hu-layout">
        <div className="panel">
          <div className="panel-heading">
            <h2>Handling units</h2>
            <span>{units.length} loaded</span>
          </div>
          <label className="field">
            <span>Handling unit</span>
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSuccess("");
                setError("");
              }}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.external_code} · {unit.status}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <dl className="hu-detail-grid">
              <div>
                <span>SKU</span>
                <strong>{selected.sku.code}</strong>
              </div>
              <div>
                <span>Quantity</span>
                <strong>{selected.quantity}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{selected.status}</strong>
              </div>
              <div>
                <span>Version</span>
                <strong>{selected.version}</strong>
              </div>
            </dl>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h2>Final inspection decision</h2>
          </div>
          <form className="hu-form" onSubmit={submit}>
            <label className="field">
              <span>Operator actor</span>
              <input
                value={operatorActor}
                minLength={3}
                maxLength={120}
                onChange={(event) =>
                  setOperatorActor(event.target.value)
                }
              />
            </label>

            <label className="field">
              <span>Result</span>
              <select
                value={result}
                onChange={(event) =>
                  setResult(event.target.value as InspectionResult)
                }
                disabled={busy}
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </label>

            <div className="inspection-checklist">
              <label>
                <input
                  type="checkbox"
                  checked={sealChecked}
                  onChange={(event) =>
                    setSealChecked(event.target.checked)
                  }
                  disabled={busy}
                />
                Package seal is intact
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={packageChecked}
                  onChange={(event) =>
                    setPackageChecked(event.target.checked)
                  }
                  disabled={busy}
                />
                Package is physically intact
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={labelChecked}
                  onChange={(event) =>
                    setLabelChecked(event.target.checked)
                  }
                  disabled={busy}
                />
                Handling-unit label matches
              </label>
            </div>

            <label className="field">
              <span>Damage or condition notes</span>
              <textarea
                value={damageNotes}
                maxLength={2000}
                onChange={(event) =>
                  setDamageNotes(event.target.value)
                }
              />
            </label>

            <label className="field">
              <span>Evidence label</span>
              <input
                value={evidenceLabel}
                maxLength={120}
                onChange={(event) =>
                  setEvidenceLabel(event.target.value)
                }
                placeholder="Development photo or document label"
              />
            </label>

            <label className="field">
              <span>Evidence SHA-256 checksum</span>
              <input
                value={evidenceChecksum}
                maxLength={64}
                onChange={(event) =>
                  setEvidenceChecksum(event.target.value)
                }
                placeholder="64 hexadecimal characters"
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={
                busy ||
                !selected ||
                selected.status === "STORED" ||
                selected.status === "QUARANTINED" ||
                selected.status === "CLOSED" ||
                history.length > 0
              }
            >
              {busy ? "Recording…" : "Record final inspection"}
            </button>
          </form>
        </div>
      </div>

      {history.length > 0 && (
        <div className="panel inspection-history">
          <div className="panel-heading">
            <h2>Inspection history</h2>
          </div>
          {history.map((inspection) => (
            <div className="inspection-history-item" key={inspection.id}>
              <strong>{inspection.result}</strong>
              <span>{inspection.operator_actor}</span>
              {inspection.damage_notes && (
                <p>{inspection.damage_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}