#!/usr/bin/env python3
"""Guarded, reversible S02-A2 integration for WARETRACE at 3da6abf.

Default --check performs no writes. --apply writes ONLY the listed frontend files.
It refuses dirty target paths and never touches the HandlingUnitsPage source/tests.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

EXPECTED_HEAD = "3da6abf2651fd7a66482938e3d7448bb464c51b1"
STAGE_ROOT = Path(__file__).resolve().parents[1]
SRC = STAGE_ROOT / "frontend" / "src" / "features" / "intake"

COPIES = [
    "frontend/src/features/intake/api.ts",
    "frontend/src/features/intake/api.test.ts",
    "frontend/src/features/intake/CameraCapture.tsx",
    "frontend/src/features/intake/IntakePage.tsx",
    "frontend/src/features/intake/CameraCapture.test.tsx",
    "frontend/src/features/intake/IntakePage.test.tsx",
]
EDITED = [
    "frontend/src/api/client.ts",
    "frontend/src/api/handlingUnits.ts",
    "frontend/src/app/App.tsx",
    "frontend/src/app/App.test.tsx",
    "frontend/src/styles/global.css",
]
TARGETS = COPIES + EDITED


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if after in source:
        return source
    count = source.count(before)
    if count != 1:
        raise ValueError(
            f"{label}: expected one matching anchor, found {count}; do not patch automatically."
        )
    return source.replace(before, after, 1)


def patch_client(source: str) -> str:
    if "export async function apiUpload(" in source:
        return source
    if "async function readResponse(" not in source or "const API_BASE_URL" not in source:
        raise ValueError("client.ts: expected API client anchors missing")
    return source.rstrip() + '''\n\n/** Upload multipart content without setting Content-Type; browser sets boundary. */
export async function apiUpload(
  path: `/${string}`,
  form: FormData,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    signal,
    headers: { Accept: "application/json" },
    body: form,
  });

  return readResponse(response);
}
'''


def patch_handling_api(source: str) -> str:
    if "export async function getHandlingUnitByCode(" in source:
        return source
    if "function validHU(" not in source or "function parseItem<" not in source:
        raise ValueError("handlingUnits.ts: expected validation helpers missing")
    return source.rstrip() + '''\n\n/** Read-only lookup of an existing HU by its registered external code. */
export async function getHandlingUnitByCode(
  code: string,
  signal?: AbortSignal,
): Promise<HandlingUnit> {
  return parseItem(
    await apiGet(
      `/handling-units/by-code/${encodeURIComponent(code)}`,
      signal,
    ),
    validHU,
  );
}
'''


def patch_app(source: str) -> str:
    source = replace_once(
        source,
        'import InventoryPage from "../features/inventory/InventoryPage";',
        'import InventoryPage from "../features/inventory/InventoryPage";\nimport IntakePage from "../features/intake/IntakePage";',
        "App.tsx import",
    )
    source = replace_once(
        source,
        'type View = "dashboard" | "inventory" | "handling-units";',
        'type View = "dashboard" | "inventory" | "handling-units" | "intake";',
        "App.tsx View union",
    )
    source = replace_once(
        source,
        '  { id: "handling-units", label: "Handling Units" },',
        '  { id: "handling-units", label: "Handling Units" },\n  { id: "intake", label: "Scan & Identify" },',
        "App.tsx navigation",
    )
    source = replace_once(
        source,
        '        {view === "handling-units" && <HandlingUnitsPage />}',
        '        {view === "handling-units" && <HandlingUnitsPage />}\n        {view === "intake" && <IntakePage />}',
        "App.tsx rendering",
    )
    return source


def patch_app_test(source: str) -> str:
    if "getHandlingUnitByCode: vi.fn()," in source:
        return source
    if 'vi.mock("../api/handlingUnits", () => ({' not in source:
        raise ValueError("App.test.tsx: handling-unit mock not found")
    return replace_once(
        source,
        '  getHandlingUnit: vi.fn(),',
        '  getHandlingUnit: vi.fn(),\n  getHandlingUnitByCode: vi.fn(),',
        "App.test.tsx handling unit API mock",
    )


def patch_css(source: str) -> str:
    css = (STAGE_ROOT / "integration" / "STYLE_APPEND.css").read_text(encoding="utf-8")
    if "/* S02-A2: Receiving camera + barcode lookup */" in source:
        return source
    return source.rstrip() + "\n\n" + css.rstrip() + "\n"

PATCHERS = {
    "frontend/src/api/client.ts": patch_client,
    "frontend/src/api/handlingUnits.ts": patch_handling_api,
    "frontend/src/app/App.tsx": patch_app,
    "frontend/src/app/App.test.tsx": patch_app_test,
    "frontend/src/styles/global.css": patch_css,
}


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return result.stdout.strip()


def run() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Read-only preview")
    mode.add_argument("--apply", action="store_true", help="Backup then integrate")
    parser.add_argument("--root", default=".", help="Path to WARETRACE project root")
    parser.add_argument(
        "--acknowledge-head-drift",
        action="store_true",
        help="Allow applying to a different Git commit only after manually rechecking its files",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / "backend" / "pyproject.toml").is_file():
        raise ValueError(f"Not a WARETRACE root: {root}")
    if not (root / "frontend" / "src" / "app" / "App.tsx").is_file():
        raise ValueError(f"Missing frontend App.tsx: {root}")

    current = git(root, "rev-parse", "HEAD")
    print(f"Git HEAD: {current}")
    print(f"Based on: {EXPECTED_HEAD}")
    if current != EXPECTED_HEAD:
        print("WARNING: local HEAD differs from verified GitHub revision.")
        if args.apply and not args.acknowledge_head_drift:
            raise ValueError("Refusing to apply to a different revision without explicit review")

    dirty = git(root, "status", "--porcelain", "--", *TARGETS)
    if dirty:
        raise ValueError(
            "These integration target paths have local changes. Preserve and inspect them first:\n"
            + dirty
        )

    desired: dict[str, bytes] = {}
    for path in COPIES:
        staged_file = STAGE_ROOT / path
        target = root / path
        incoming = staged_file.read_bytes()
        existing = target.read_bytes() if target.exists() else b""
        if existing and existing != incoming:
            raise ValueError(
                f"Refusing to overwrite nonempty intake file: {path}. Inspect differences manually."
            )
        desired[path] = incoming
    for path, patcher in PATCHERS.items():
        old = (root / path).read_text(encoding="utf-8")
        desired[path] = patcher(old).encode("utf-8")

    changes = []
    for path, incoming in desired.items():
        target = root / path
        existing = target.read_bytes() if target.exists() else None
        if existing != incoming:
            changes.append(path)

    print(f"Files to change: {len(changes)}")
    for path in changes:
        print("  +", path)
    print("Protected: HandlingUnitsPage.tsx and HandlingUnitsPage.test.tsx are NOT touched")
    if args.check:
        print("CHECK COMPLETE: no files written")
        return 0
    if not changes:
        print("No changes necessary")
        return 0

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backups = STAGE_ROOT / "_backups" / stamp
    created = []
    try:
        for path in changes:
            target = root / path
            if target.exists():
                destination = backups / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, destination)
            else:
                created.append(target)
        for path in changes:
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(desired[path])
    except BaseException:
        for path in changes:
            target = root / path
            backup = backups / path
            if backup.exists():
                shutil.copy2(backup, target)
            elif target in created:
                target.unlink(missing_ok=True)
        raise

    print(f"Applied {len(changes)} files. Previous versions backed up under {backups}")
    print("Next: cd frontend; npm test; npm run build; npm run lint")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(run())
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print(f"STOPPED SAFELY: {exc}", file=sys.stderr)
        sys.exit(1)
