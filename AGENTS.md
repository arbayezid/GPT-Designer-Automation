# Agent Rules

- Every repo update must also update the extension version in `public/manifest.json`.
- Every repo update must also update the manifest `version_name` with the same version and the current last-updated date in `YYYY-MM-DD` format.
- Keep `package.json` and `package-lock.json` versions aligned with `public/manifest.json`.
- Do not add Google service-account JSON keys or other private credentials to the extension bundle or source control.
- After changing `public/manifest.json`, run `npm run build` so `dist/manifest.json` is refreshed.
