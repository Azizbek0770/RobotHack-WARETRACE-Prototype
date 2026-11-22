# WARETRACE S02-A2 — Updated receiving integration

**Verified source revision:** GitHub `main` commit `3da6abf2651fd7a66482938e3d7448bb464c51b1` (22 November 2026).

The previous `16dd241f` to `3da6abf` comparison contains **only two changed files**: `frontend/src/features/handling-units/HandlingUnitsPage.tsx` and `HandlingUnitsPage.test.tsx`. This patch neither reads nor writes those two files. RAG-Anything is untouched.

## What this package includes

- `frontend/src/features/intake/CameraCapture.tsx`: explicit camera permission, capture and camera track cleanup.
- `frontend/src/features/intake/IntakePage.tsx`: image/manual identification and read-only lookup.
- `frontend/src/features/intake/api.ts`: validated multipart decode client.
- Three test files covering camera, lookup and decode client behavior (**12 new test cases total**).
- `integration/apply_integration.py`: guarded incremental installation with dry-run, Git checks, backups and rollback on write errors.
- `integration/STYLE_APPEND.css`: additive dark-theme intake styling.
- `integration/RAG_02A_NEXT.md`: a separately scoped RAG experiment prompt grounded in the latest GitHub revision.

## Important correction from previous patch

The FastAPI `HandlingUnitCreate.external_code` Pydantic schema allows `^[A-Z0-9][A-Z0-9._-]*$` (minimum 3, maximum 120 characters). It **does not** require the `HU-` prefix. The updated scanner accepts all valid codes, normalizes casing to uppercase and refuses QR URLs and invalid text. For example, `DEMO-2026` is a valid existing handling-unit label, even if the demo fixtures use `HU-0001`.

## Before applying

From the actual Windows WARETRACE project root, e.g. `C:\Users\Lenovo\Desktop\RobotHack WARETRACE Prototype`:

```powershell
git rev-parse HEAD
git status --short
```

**Never reset, stash or overwrite local code blindly.** The GitHub revision is the remote source used to build this package; your local working tree may have uncommitted or newer changes.

## Extract the ZIP

Assuming the ZIP is downloaded to Windows Downloads:

```powershell
New-Item -ItemType Directory -Force .\_stage_s02a2_v2 | Out-Null
Expand-Archive `
  -Path "$HOME\Downloads\WARETRACE_S02_A2_UPDATED_3da6abf.zip" `
  -DestinationPath .\_stage_s02a2_v2 `
  -Force
```

The ZIP contains `frontend/...` and `integration/...` directly; no extra wrapper directory.

## Dry-run first (no writes)

```powershell
& .\backend\.venv\Scripts\python.exe `
  .\_stage_s02a2_v2\integration\apply_integration.py --check
```

The script checks exact source anchors, Git status, local HEAD, and refuses overwriting nonempty receiving source. It reports the files it would modify. The expected list contains 11 frontend files, including six new receiving source/test files and five minimal integration edits.

**Do not apply if the script reports a conflict or unexpected revision.** Review your local changes first. The `--acknowledge-head-drift` option exists for an engineer who has personally reconciled a newer/older HEAD; it must not be used merely to bypass warnings.

## Apply (backed up)

```powershell
& .\backend\.venv\Scripts\python.exe `
  .\_stage_s02a2_v2\integration\apply_integration.py --apply
```

Changes made:

1. Fills the receiving source files (currently empty placeholders at the verified revision) and adds tests.
2. Adds `apiUpload()` to `frontend/src/api/client.ts`, without changing `apiGet` or `apiPost`.
3. Adds `getHandlingUnitByCode()` to `frontend/src/api/handlingUnits.ts`, reusing its response validator.
4. Adds a `Scan & Identify` nav item and conditional `IntakePage` render to `frontend/src/app/App.tsx`.
5. Adds the new API mock export to `frontend/src/app/App.test.tsx`.
6. Appends CSS for the new UI to `frontend/src/styles/global.css`.

Backups are written under `_stage_s02a2_v2/_backups/<timestamp>/` before edits. The script does **not** modify handling-unit UI files, the backend, RAG files or migrations.

## Run tests and build

```powershell
Push-Location frontend
npm test
npm run build
npm run lint
Pop-Location
```

Start the backend, then the frontend in separate terminals:

```powershell
& .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

```powershell
Push-Location frontend
npm run dev
```

Open `http://localhost:5173` → **Scan & Identify**.

## Acceptance tests in browser

1. Manual lookup `HU-0001` returns a persisted HandlingUnit (SKU-001, quantity 8 on the baseline demo seed).
2. Upload a PNG QR encoding `HU-0001`: scan and read-only HU lookup succeed.
3. Manual lookup supports valid alternative codes like `DEMO-2026`, if the record actually exists. A nonexistent valid code shows 404, not an invented record.
4. A QR containing a URL is rejected before lookup and is never opened.
5. A photo with multiple codes shows explicit choices; none is silently selected.
6. Camera opens only after clicking **Start camera**, and **Stop camera** releases its tracks. Camera denial still allows upload and manual entry.
7. If the backend is offline, the UI shows the failure instead of reporting success.
8. Navigate away with the camera active: video capture must stop.

**No stock changes** are made by identification. Camera scans read existing labels; they are not product-damage recognition or inspection.

## Security and deployment notes

- `getUserMedia()` works on `localhost` and secure HTTPS origins, not ordinary HTTP on a phone connecting via the laptop LAN IP.
- This S02-A2 layer is read-only. Do not expose the existing unauthenticated warehouse write endpoints publicly.
- Browser FormData requests must omit explicit `Content-Type` so the browser can generate multipart boundaries.
- Do not commit the stage folder or backup folder. Inspect `git diff`, then add only intended `frontend/src` changes after full verification.

## Verification limitations

The new `.ts`/`.tsx` files passed syntax transpilation; the guarded script passed dry-run and apply tests in a disposable Git repo. **Real frontend Vitest, production TypeScript build, ESLint, webcam access and live FastAPI requests have not been run against your Windows repository.** Report any failure and its exact output rather than claiming completion.
