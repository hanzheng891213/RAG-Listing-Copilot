# Smoke checks

Throwaway-but-repeatable checks used while reworking the 上架表, the listing page and the
model manager. None of them run in CI; run them by hand against a local dev stack.

## Prerequisites

```powershell
npm run dev                       # backend :3001, frontend :5175
```

### 1. Pure field/import mapping (no browser)

```powershell
node backend/node_modules/tsx/dist/cli.mjs scripts/smoke/fields.ts
```

## Browser checks

These drive a real Chromium over the DevTools Protocol, so they exercise the same code paths a
user does (router guards, API calls, generated DOM).

```powershell
# headless Chrome with CDP
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new `
  --remote-debugging-port=9222 --user-data-dir="$env:TEMP\dsh-chrome-profile" about:blank

# mint an admin token (dev secret is the one in backend/.dev.vars)
cd backend; node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({userId:'admin-001',username:'admin',role:'admin'},'rag-copilot-jwt-secret-2026-dev',{expiresIn:'1h'}))"
```

Set `$env:DSH_SMOKE_TOKEN` to that value, then:

| Script | What it proves |
|---|---|
| `ui.mjs` | /model-manager, /product-grid and /listing-generator render with no render-time exception |
| `import.mjs <csv>` | file input → backend parse → header mapping → batch save → row visible; prints headers, batch payload, grid rows |
| `delete.mjs <sku>` | the frozen 操作 column's 删除 button removes exactly that row and persists it |
| `grid-actions.mjs` | 生成 without a model routes to Model Manager; with a model it opens the 7-language ring and Escape closes it |
| `generate.mjs <sku>` | visitor (demo) generation is streamed and written back into the same row |
| `batch.mjs <sku…>` | listing page batch generation writes titles into the selected rows |

`import.mjs`/`generate.mjs`/`batch.mjs` need rows owned by the token's user; create them with
`POST /api/products/batch` first (or delete them afterwards — the dev backend stores rows in
process memory only).
