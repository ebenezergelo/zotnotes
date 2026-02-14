# ZotNotes (Tauri + React)

Minimal desktop app to export Zotero PDF annotations into structured Markdown grouped by annotation color, including selected-area image extraction when available.

This is a native desktop app (Tauri) for macOS/Windows/Linux, not a standalone web deployment.

## Screenshots

![ZotNotes main interface](screenshots/4.png)
*Main interface showing library item search and export functionality*

<details>
<summary>Additional UI screenshots</summary>

![Settings dialog](screenshots/2.png)
*Settings dialog with output directories and Zotero API configuration*

![Template customization](screenshots/1.png)
*Color section header customization for annotation grouping*

</details>

![Exported note in Octarine](screenshots/3.png)
*Example of exported annotations viewed in Octarine (PKM software), showing color-grouped annotations*

## Stack

- Tauri v2 (Rust backend commands + local settings persistence)
- React + TypeScript + Vite
- Tailwind + shadcn/ui design language (Button, Input, Dialog, Card, ScrollArea/Command-like list)

## Features implemented

- Single-window UI
- Top bar with Zotero connection status + Settings button
- Searchable item picker and metadata preview panel
- Settings dialog with:
  - Markdown output directory
  - Attachment base directory
  - Zotero API key
  - Zotero base URL (default `http://127.0.0.1:23119`)
  - Test connection button
- Export button (disabled until settings + item selection are valid)
- Dry run mode prints markdown + planned image paths without writing files
- Debug button (`Debug: Dump JSON`) writes selected item + children + attachment annotation payloads to temp JSON for field inspection
- Local Zotero desktop SQLite fallback for item search, item metadata, and annotation extraction
- Zotero deep links on page labels (`[p. X]`) pointing to annotation items

## Rust commands

Implemented in `src-tauri/src/lib.rs`:

- `select_directory_dialog()`
- `save_markdown_file(path, content)`
- `ensure_dir(path)`
- `save_png_bytes(path, bytes)`
- `load_settings()` / `save_settings()`
- `write_temp_debug_dump(prefix, content)`
- `zotero_proxy_get_json(url, zotero_api_key)`
- `zotero_proxy_get_bytes(url, zotero_api_key)`

## App behavior and export format

- Markdown file path: `{markdownDir}/@{citeKey}.md`
- Image path pattern: `{attachmentBaseDir}/attachment/{citeKey}/image_1.png`, `image_2.png`, ...
- Frontmatter keys and layout follow exact required keys:

```yaml
---
tags:
  - type/source/paper
Title: ''
Author: ''
Year: ''
Company: ''
---
```

Then:

- `Project:` line
- Optional abstract callout immediately after YAML/project block
- `## Notes`
- Per-color `### ColorName` section with blockquoted annotations and blank blockquote lines between annotations

## Zotero API and Better BibTeX mapping

The app now uses a hybrid strategy:

- Preferred annotation source: local Zotero desktop database (`~/Zotero/zotero.sqlite`, opened read-only with `immutable=1`)
- HTTP API fallback: local Zotero API (`http://127.0.0.1:23119`) when SQLite is unavailable
- Search/item metadata can also fall back to SQLite when API requests fail

### Endpoint mapping currently implemented

The app currently uses these local API paths:

- Ping: `/connector/ping`
- Search items: `/api/users/0/items?limit=75&sort=title&direction=asc&q=...&qmode=titleCreatorYear`
- Get item: `/api/users/0/items/{itemKey}`
- Get children: `/api/users/0/items/{itemKey}/children?limit=200`
- Candidate selected-area image fetch:
  - `/api/users/0/items/{annotationKey}/file`
  - `/api/users/0/items/{annotationKey}/file/view`

### Desktop SQLite fallback

- Default DB path candidates:
  - `~/Zotero/zotero.sqlite`
  - `~/Zotero Beta/zotero.sqlite`
- Override path:
  - `ZOTERO_SQLITE_PATH=/absolute/path/to/zotero.sqlite`

SQLite mode is read-only and avoids lock contention by opening with `immutable=1`.

Selected-area image fallback:

- If HTTP image endpoints fail, the app reads Zotero's local annotation cache image at:
  - `~/Zotero/cache/library/{annotationKey}.png`

### Cite key resolution (Better BibTeX)

Resolution order in `src/lib/citekey.ts`:

1. Direct item fields (`citationKey`, `citekey`, `bibtexKey`, `meta.citationKey`)
2. Parse from `extra` lines like `Citation Key: mykey`
3. If still missing: blocking export error with remediation guidance

### Color grouping

Hex color values are mapped to names; unknown values are grouped as `Unknown (<hex>)`.
Group order is deterministic:

1. Yellow
2. Green
3. Blue
4. Pink
5. Orange
6. Purple
7. Gray
8. Unknown (then alphabetical)

## Important validation workflow (required)

Because this container could not reach a running Zotero process during implementation, the app includes explicit inspection tooling to validate endpoint/field shape on your machine:

1. Launch app and select an item.
2. Click `Debug: Dump JSON`.
3. Inspect emitted temp JSON file path shown in toast.
4. Confirm field mappings for:
   - annotation text/comment
   - page labels
   - annotation color hex
   - selected-area image retrieval endpoint behavior

Also available:

```bash
node scripts/zotero-debug.mjs <ITEM_KEY>
```

Environment variables:

- `ZOTERO_BASE_URL` (optional, defaults to `http://127.0.0.1:23119`)
- `ZOTERO_API_KEY` (optional)

## Local development

```bash
npm install
npm run tauri dev
```

## Build macOS DMG

```bash
npm run build:dmg
```

This runs `scripts/build_dmg.sh`, which builds with Tauri and outputs the installer to `src-tauri/target/release/bundle/dmg`.

## Publishing Releases

The repository is configured with GitHub Actions to automatically build and publish releases:

1. **Update version** in `package.json` and `src-tauri/tauri.conf.json`
2. **Commit changes:**
   ```bash
   git add package.json src-tauri/tauri.conf.json
   git commit -m "chore: bump version to 0.2.0"
   ```
3. **Create and push a version tag:**
   ```bash
   git tag v0.2.0
   git push origin main --tags
   ```
4. GitHub Actions will automatically:
   - Build the macOS DMG
   - Create a GitHub Release
   - Attach the DMG as a downloadable asset
   - Generate release notes from commits

Users can then download the DMG from the [Releases page](https://github.com/ebenezergelo/zotnotes/releases).

### Tests

```bash
npm test
```

Includes unit test for markdown generation at `src/__tests__/markdown.test.ts`.
Vitest config: `vitest.config.ts`.

## How to install shadcn/ui in this project

This repository uses shadcn/ui-style component primitives directly in source (`src/components/ui`).
If you want canonical shadcn CLI-managed components:

1. `npx shadcn@latest init`
2. Configure Tailwind + aliases if prompted (`@/*` -> `src/*`)
3. Add components:
   - `npx shadcn@latest add button input dialog card scroll-area command`
4. Replace local component files with generated variants as desired

## Better BibTeX setup

1. Install Better BibTeX in Zotero.
2. Ensure items have citation keys (for example in `Extra`: `Citation Key: your_key`).
3. If export fails with cite key missing, regenerate keys in Better BibTeX and retry.

## Troubleshooting

- `Disconnected` status:
  - Ensure Zotero is running
  - Ensure local API/connector endpoint is reachable
  - Verify base URL and API key in Settings
- Export fails on cite key:
  - Better BibTeX key missing; set it in item `Extra` or regenerate keys
- Selected-area images not exported:
  - App falls back to text export and inserts TODO marker in markdown
  - Check debug dump JSON to confirm where image bytes are exposed for your Zotero build
