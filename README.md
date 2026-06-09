# GPT Designer

Chrome Manifest V3 extension for running prompt batches in ChatGPT from either Google Drive folders or local folders, then saving generated images back to the selected storage provider.

## What It Does

- Reads `SET-*` batches from Drive or a local input directory.
- Loads reference images and a CSV/XLSX prompt file from each set.
- Opens a fresh ChatGPT thread per set.
- Uploads reference images for the first prompt, then sends prompts sequentially in the same thread.
- Extracts generated ChatGPT image URLs from the latest assistant turn.
- Saves generated images under `SET-X/Prompt-Y/`.

Expected input layout:

```txt
INPUT_ROOT/
  SET-1/
    reference-1.png
    reference-2.jpg
    prompts.csv
```

Output layout:

```txt
OUTPUT_ROOT/
  SET-1/
    Prompt-1/
      prompt-1-image-1.png
    Prompt-2/
      prompt-2-image-1.png
```

## Setup

```bash
npm install
npm run build
```

Load the built extension from `dist/`:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked**.
4. Select this project's `dist/` folder.

## Drive Service Account

Drive mode uses a local-only Google service account JSON file. This is intended for internal/local company use, not public extension distribution.

Place the service account key at the project root:

```txt
drive-service-account.json
```

Then build:

```bash
npm run build
```

The build script copies the ignored local key into `dist/drive-service-account.json` for the unpacked extension.

Share the Drive input/output folders with the service account's `client_email`; otherwise Drive API calls will not see those folders.

Keep `drive-service-account.json` out of source control. It is ignored by `.gitignore`, and it should only exist locally and in the generated local `dist/` extension bundle.

## Storage Modes

**Drive mode**

- User enters Drive input and output folder IDs.
- Extension lists `SET-*` folders from the input folder.
- Generated images are uploaded through Google Drive API v3 using the bundled local service account.

**Local mode**

- User selects input and output directories using the File System Access API.
- Useful for development and testing without Drive access.
- Works in Chromium browsers that expose `showDirectoryPicker`.

## Project Shape

```txt
src/
  background/        MV3 service worker and runtime message handling
  content/chatgpt/   ChatGPT selectors and DOM automation
  core/              storage/logging services
  drive/             service-account auth and Drive API provider
  local/             File System Access provider
  popup/             extension popup UI
  sheets/            CSV/XLSX prompt parsing
  shared/            cross-context types and utilities
  storage/           provider-neutral batch storage contract
  workflow/          automation orchestration and job state
tests/               parser, selector, storage, provider, and state tests
public/              manifest and extension icons
scripts/             build script
dist/                generated extension output
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Agent Rules

- Every update must bump the extension version in `public/manifest.json`.
- Every update must refresh `version_name` with the same version and the current last-updated date.
- Keep `package.json` and `package-lock.json` versions aligned with the manifest version.
- Rebuild after manifest changes so `dist/manifest.json` stays current.

Current verified state:

- 23 tests pass.
- Production build writes a loadable extension to `dist/`.
- Runtime dependency audit reports 0 vulnerabilities.

## Current v0 Limits

- The user must already be logged into ChatGPT in the same Chrome profile.
- ChatGPT web UI selectors can change; selector logic is isolated in `src/content/chatgpt/`.
- Long jobs may still be interrupted by Chrome MV3 service-worker lifecycle behavior.
- Local folder permissions may need to be re-granted after browser restarts.
