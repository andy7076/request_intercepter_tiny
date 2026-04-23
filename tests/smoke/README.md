# Smoke tests

Playwright-based end-to-end smoke tests that load the unpacked extension into
a real Chromium instance, seed a rule via `chrome.storage`, and assert that
`fetch` / `XMLHttpRequest` responses are actually replaced.

## One-time setup

```bash
npm install                 # installs @playwright/test
npm run smoke:install       # downloads Chromium (~150MB)
```

## Run

```bash
npm run smoke
```

Notes:

- **Headed Chromium is required.** MV3 service workers don't always boot under
  old `--headless`; `headless: false` is hard-coded in `smoke.spec.js`.
  On CI, wrap the command with `xvfb-run`:
  ```bash
  xvfb-run -a npm run smoke
  ```
- The spec spawns a throwaway HTTP server on a random port for the target
  page (`fixtures/target.html`) and the `/api/user` endpoint.
- Each test uses a fresh `userDataDir` under Playwright's output directory so
  extension state never leaks across runs.

## What is covered

| Spec | Asserts |
|---|---|
| `mock fetch 响应体` | `fetch` + `XHR` both return mocked body + `x-mocked-by` header |
| `关闭开关后请求恢复原样` | `interceptorEnabled=false` disables interception end-to-end |

Add more scenarios by appending tests in `smoke.spec.js`.
