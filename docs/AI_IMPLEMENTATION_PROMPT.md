# AI Implementation Handoff Prompt

Copy the prompt below into a new AI coding session with this repository open. Replace
`[DESCRIBE THE FEATURE HERE]` with the feature or bug you want to work on.

---

## Prompt

You are helping implement a feature in the **Naveed Medical Pharmacy (NMP) management and POS system**. Work in the existing repository; do not assume this is a greenfield project.

### Task

`[DESCRIBE THE FEATURE HERE]`

### Product and architecture context

NMP is a pharmacy management application with a React + TypeScript frontend and an Express + TypeScript backend. It uses SQLite through `better-sqlite3`; there is no separate database server. The frontend is served by Vite during local development and calls the backend API. The same backend also supports local/offline and hosted deployment modes.

The application includes POS and sales, medicine catalog and batch inventory, FEFO stock allocation, purchasing, suppliers, returns, patients and credit (Udhaar), prescriptions, clinical references, MedPrac training records, expiry control, accounts, reporting, staff/RBAC, audit logs, barcode/receipt printing, backups and offline synchronization.

Treat the **current source code and package manifests as authoritative**. Some documentation and status notes can be historical or lag behind recent code. Verify behavior in the source before relying on a document.

### Start by reading the relevant context

Read these first:

1. `README.md` — product overview, local setup, scripts and operating notes.
2. `docs/ARCHITECTURE.md` — high-level system design.
3. `docs/BUSINESS_RULES.md` — important inventory, POS and financial invariants.
4. `docs/DATABASE.md` — database concepts; confirm exact current columns in the SQL schema.
5. `docs/API.md` — API overview; confirm exact current routes and payloads in route code.
6. `docs/SECURITY.md` — authentication, permissions and audit expectations.
7. `docs/TESTING.md` — test strategy and known testing constraints.
8. `docs/KNOWN_ISSUES.md` and `docs/DECISIONS.md` — relevant limitations and prior design decisions.

Then trace the requested feature through the actual implementation. Read the matching UI, API route, service, schema, shared types and existing tests before editing. Do not read or change unrelated modules.

### Repository map

#### Root and configuration

- `package.json` — root scripts: `dev`, `build`, `test`, `seed`, and database export/import.
- `client/package.json` — frontend dependencies and Vite/build scripts.
- `server/package.json` — backend dependencies, development/build/start, seed and Vitest scripts.
- `client/vite.config.ts` — local web server on port 5173 and `/api` proxy to port 5000.
- `client/tsconfig.json`, `server/tsconfig.json` — strict TypeScript configuration.
- `client/vercel.json` — frontend hosting and API routing configuration.

#### Frontend

- `client/src/main.tsx` — React entry point; wraps the app in `AuthProvider` and loads global CSS.
- `client/src/App.tsx` — authenticated application shell and view selection. Add a new view here only if the feature needs a new application area.
- `client/src/context/AuthContext.tsx` — login/session restoration, token storage, theme, role and permission helpers.
- `client/src/components/` — shared navigation, headers, selectors and feature dialogs/modals.
- `client/src/views/` — full-page application modules. Find the closest existing view and follow its data-fetching and UI patterns.
- `client/src/services/` — shared client workflows, including offline synchronization and MedPrac/Udhaar behavior.
- `client/src/types/` — shared frontend domain/API TypeScript types.
- `client/src/utils/` — reusable catalog, packaging, JSON-safety, barcode and printer helpers.
- `client/src/index.css` — shared visual design system and application styles.

#### Backend

- `server/src/index.ts` — Express app, middleware, health endpoint, API route mounting, optional local client serving and server startup.
- `server/src/routes/` — HTTP endpoints and request validation. Each feature usually has a route module mounted under `/api/...` in `index.ts`.
- `server/src/services/` — multi-step business workflows and integrations; reuse an existing service when applicable.
- `server/src/middleware/auth.ts` — JWT authentication and authorization helpers.
- `server/src/middleware/security.ts` — security headers.
- `server/src/db/index.ts` — SQLite connection, WAL/foreign-key settings, schema initialization and compatibility migrations.
- `server/src/db/schema.sql` — current database table definitions and indexes.
- `server/src/db/seed.ts` and `server/src/db/seedScheduleBD.ts` — local development/reference data setup.
- `server/src/types` (if present) and route-local interfaces — backend request/domain types; inspect the actual tree before assuming a shared type location.
- `server/src/utils/` — reusable server helpers such as safe JSON parsing.
- `server/src/tests/` — Vitest integration tests using the repository's existing patterns.

#### Documentation

- `docs/UI_MAP.md` — navigation and view responsibilities.
- `docs/API.md` — documented API surface.
- `docs/DATABASE.md` — data model overview.
- `docs/BUSINESS_RULES.md` — business invariants.
- `docs/AI_DRUG_SAFETY.md` — clinical AI boundaries and safety requirements.
- `docs/DEPLOYMENT.md`, `docs/BACKUP_RECOVERY.md`, `docs/RECOVERY_GUIDE.md` — deployment and data recovery.
- `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md` — status/history; verify claims against current code.

### Typical feature tracing

For a frontend-backed feature, follow this path as applicable:

1. Find its view in `client/src/views/` and how it is connected in `client/src/App.tsx` and `client/src/components/Sidebar.tsx`.
2. Inspect related reusable components, client services and types.
3. Find the API request in the client and the matching route in `server/src/routes/`.
4. Follow any business logic into `server/src/services/` and database queries into `server/src/db/`.
5. Read related tests in `server/src/tests/` and add or update targeted tests.
6. Update directly related docs when the API, behavior, schema, setup or user workflow changes.

Not every feature needs every layer. Keep the change limited to the layers required by the task, but make the entire feature work end to end.

### Known recent startup issue: login reports HTTP 502

The local development app recently showed this error on the login screen:

> Server is not responding yet (status 502). Please wait a moment and try again.

The actual problem was not an incorrect username/password and not primarily a frontend login bug. Vite was running on port 5173, but its `/api` proxy could not reach the backend on port 5000 because the backend crashed during module loading. The server error was:

```text
SyntaxError: The requested module '../services/invoiceScanService.js'
does not provide an export named 'getGeminiApiKey'
```

#### Why it happened

Uncommitted invoice-scanning UI/API work had been added across:

- `client/src/views/PurchasesView.tsx` — added the quick AI invoice-upload UI and a request to `POST /api/purchases/scans/ai-quick-extract`.
- `client/src/components/ScanUploadModal.tsx` — added an AI availability check to `GET /api/purchases/scans/ai-status`.
- `server/src/routes/purchaseInvoiceScanRoutes.ts` — imported and called `getGeminiApiKey` and `quickAiExtractInvoice` for those endpoints.

However, `server/src/services/invoiceScanService.ts` still only implemented the local OCR and text-parsing functions; it did not export either of the two new functions. Because the backend uses ES modules, importing the route with missing named exports throws before Express starts listening. The frontend server can still start, so the browser page loads, but login/API requests receive a 502 from the development proxy and cannot succeed.

#### Diagnostic conclusion and repair

The missing service implementations were added to `server/src/services/invoiceScanService.ts`:

- `getGeminiApiKey()` reads `GEMINI_API_KEY` from the backend process environment and returns no key when it is unset.
- `quickAiExtractInvoice(...)` validates file types and empty uploads, sends the uploaded invoice content to Gemini using the configured server-side key, parses the returned JSON, validates/coerces the result, and returns the fields expected by the purchase form. It does not claim to match supplier or medicine catalog IDs; those remain `null` for staff to review and select.
- The model label in `server/src/routes/purchaseInvoiceScanRoutes.ts` was aligned with the service's Gemini 2.5 Flash model.
- The user-facing action label in `client/src/views/PurchasesView.tsx` was changed to avoid claiming a specific free tier/model behavior.

Update (2026-11-11): the AI invoice reader now prefers `GROQ_API_KEY` and falls back to `GEMINI_API_KEY`; extraction returns a side-effect-free review draft (`server/src/services/invoiceReviewService.ts`) and the catalog/stock are only written by `POST /api/purchases`. See `docs/CHANGELOG.md` (2026-11-11). Configure the key in `server/.env` if AI extraction is wanted. Never copy, print, commit, or share the actual key. Invoice extraction is optional: ordinary server startup and local OCR should not require a Gemini key.

#### Verification and working-tree caution

After this repair, both `npm --prefix server run build` and `npm --prefix client run build` passed. A local startup check confirmed `GET http://127.0.0.1:5000/api/health` returned healthy and the frontend returned HTTP 200. The development servers were then stopped as requested. The live Gemini API call was not exercised, so do not claim that external AI extraction has been verified.

These invoice-scanning files may contain uncommitted changes. Before further edits, inspect `git status` and `git diff` for all of the files above and preserve the user's work. Do not remove the quick-AI imports/UI as a shortcut for fixing startup; ensure every route import has a real, type-safe implementation and test/build the complete client-server path.

### Non-negotiable business and engineering rules

- Preserve strict FEFO behavior and never allow expired batches or negative stock to be sold.
- Every stock quantity change must have a corresponding, traceable stock movement.
- Keep multi-step financial, sales and inventory writes atomic using SQLite transactions.
- Preserve ledger and cashbook consistency; do not calculate business-critical totals only in the UI.
- Enforce authentication and permissions on the server. Hiding a button in the UI is not authorization.
- Keep audit logging for destructive and financially meaningful actions, following nearby patterns.
- Preserve existing IDs, balances, history and references when editing patient/customer or other linked records.
- Validate and normalize input on the server. Use parameterized SQL statements; do not build queries from user input.
- For clinical/medicine safety content, preserve the separation between verified source data and generated suggestions. Do not invent clinical facts.
- Avoid changing unrelated behavior, bulk formatting, or adding dependencies without a clear need.
- Use the repository's existing naming, TypeScript, SQL, error-handling, and UI conventions.
- Do not reset, overwrite, seed into, or otherwise damage an operational database to run tests. Use a temporary database path for tests that touch SQLite.

### Implementation workflow

1. Inspect `git status` first. Preserve existing user changes; do not revert unrelated work.
2. Confirm the desired behavior and any important edge cases. If the task is genuinely ambiguous or requires a product decision, ask before choosing.
3. Search for prior art and trace the complete affected flow before editing.
4. Make the smallest complete change. Add or update tests for behavior, validation, permissions, and important edge cases.
5. Run the narrowest relevant tests first, then the appropriate build/type checks. Report commands and results accurately; do not claim a test passed unless it ran successfully.
6. Review the final diff for unrelated changes and summarize what changed, what was tested, and any remaining caveats.

### Local development commands

From the repository root:

```bash
npm install
npm --prefix server install
npm --prefix client install
npm run seed
npm run dev
```

Then open `http://localhost:5173`; the backend API is at `http://localhost:5000` and its health endpoint is `/api/health`. Keep the development terminal open while using the app. Database seed data and local credentials are for development only; never use the default development setup as a public deployment configuration.

Useful checks:

```bash
npm --prefix client run build
npm --prefix server run build
npm test
```

The project uses `better-sqlite3`, a native Node module. If installation fails on a machine because of Node, operating-system or compiler compatibility, report the exact error and use a supported local toolchain; do not make unrelated application-source changes to conceal an environment problem.

### Your response when finished

Summarize:

- The behavior implemented and the main files changed.
- Tests/builds actually run and whether they passed.
- Any known limitation or follow-up needed.

Do not merely describe a proposed implementation when the repository and task allow you to implement and verify it.
