# Kwality Centre — Development Plan

> Last updated: Feb 21, 2026

## Project Structure

```
kwality-centre/
├── src/
│   ├── index.ts                  # Hono app entry point
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema (all tables)
│   │   ├── migrate.ts            # Migration runner
│   │   └── index.ts              # DB connection
│   ├── routes/
│   │   ├── auth.ts               # Google OAuth routes
│   │   ├── dashboard.ts          # Dashboard page
│   │   ├── projects.ts           # Project CRUD
│   │   ├── test-cases.ts         # Test case CRUD
│   │   ├── suites.ts             # Test suite CRUD
│   │   ├── runs.ts               # Test run CRUD & execution
│   │   └── import.ts             # Xray import
│   ├── views/
│   │   ├── layout.tsx            # Base HTML layout (head, nav, sidebar)
│   │   ├── components/
│   │   │   ├── navbar.tsx        # Top navigation bar
│   │   │   ├── sidebar.tsx       # Project-scoped sidebar
│   │   │   ├── table.tsx         # Reusable data table
│   │   │   ├── badge.tsx         # Status/priority badges
│   │   │   ├── modal.tsx         # HTMX-powered modal
│   │   │   ├── pagination.tsx    # Pagination controls
│   │   │   ├── empty-state.tsx   # Empty state prompts
│   │   │   └── toast.tsx         # Notification toasts
│   │   ├── dashboard.tsx         # Dashboard view
│   │   ├── projects/
│   │   │   ├── list.tsx          # Project list
│   │   │   └── form.tsx          # Create/edit project
│   │   ├── test-cases/
│   │   │   ├── list.tsx          # Test case table
│   │   │   ├── detail.tsx        # Single test case view
│   │   │   └── form.tsx          # Create/edit with step builder
│   │   ├── suites/
│   │   │   ├── list.tsx          # Suite list
│   │   │   └── form.tsx          # Create/edit suite
│   │   ├── runs/
│   │   │   ├── list.tsx          # Run history table
│   │   │   ├── execute.tsx       # Run execution UI
│   │   │   └── results.tsx       # Run results detail
│   │   └── import/
│   │       └── xray.tsx          # Xray import UI
│   ├── services/
│   │   ├── xray.ts               # Xray Cloud API client
│   │   └── wiki-markup.ts        # Jira wiki markup → HTML converter
│   └── middleware/
│       └── auth.ts               # Auth guard middleware
├── drizzle/                      # Generated migrations
├── public/
│   └── assets/                   # Static CSS, images
├── uploads/                      # User-uploaded attachments
├── docs/                         # Documentation (this file, etc.)
├── drizzle.config.ts             # Drizzle config
├── tsconfig.json
├── package.json
└── .env.local                    # Environment variables (git-ignored)
```

## Database Schema

### Tables

```
users
├── id (uuid, PK)
├── email (unique)
├── name
├── avatar_url
├── created_at
└── last_login_at

projects
├── id (uuid, PK)
├── name
├── description
├── created_by (FK → users)
├── created_at
└── updated_at

folders
├── id (uuid, PK)
├── project_id (FK → projects)
├── parent_id (FK → folders, nullable — null = root level)
├── name
├── path (text, full path e.g., "/Regression (App)/Account")
├── created_at
└── updated_at

test_cases
├── id (uuid, PK)
├── project_id (FK → projects)
├── folder_id (FK → folders, nullable — null = root/unfoldered)
├── title
├── description
├── preconditions
├── priority (enum: low, medium, high, critical)
├── type (enum: functional, regression, smoke, integration, e2e)
├── status (enum: draft, active, deprecated)
├── tags (text[])
├── xray_key (nullable, e.g., "TEST-2045")
├── xray_issue_id (nullable, e.g., "55082")
├── created_by (FK → users)
├── created_at
└── updated_at

test_steps
├── id (uuid, PK)
├── test_case_id (FK → test_cases)
├── step_number (int)
├── action (text)
├── data (text, nullable)
├── expected_result (text)
└── created_at

test_suites
├── id (uuid, PK)
├── project_id (FK → projects)
├── name
├── description
├── created_by (FK → users)
├── created_at
└── updated_at

suite_test_cases (junction table)
├── suite_id (FK → test_suites)
├── test_case_id (FK → test_cases)
└── position (int, for ordering)

test_runs
├── id (uuid, PK)
├── project_id (FK → projects)
├── suite_id (FK → test_suites, nullable)
├── name
├── status (enum: planned, in_progress, completed)
├── environment (text, nullable)
├── assigned_to (FK → users, nullable)
├── started_at (nullable)
├── completed_at (nullable)
├── created_by (FK → users)
├── created_at
└── updated_at

test_results
├── id (uuid, PK)
├── run_id (FK → test_runs)
├── test_case_id (FK → test_cases)
├── status (enum: not_run, passed, failed, blocked, skipped)
├── notes (text, nullable)
├── defect_url (text, nullable)
├── duration_seconds (int, nullable)
├── executed_by (FK → users, nullable)
├── executed_at (nullable)
├── created_at
└── updated_at

attachments
├── id (uuid, PK)
├── test_result_id (FK → test_results, nullable)
├── test_case_id (FK → test_cases, nullable)
├── filename
├── filepath (local disk path)
├── file_size (int)
├── mime_type
├── uploaded_by (FK → users)
└── uploaded_at
```

## Development Phases

---

### Phase 1: Foundation
**Goal**: Running app with auth and project management.

| Task | Description |
|------|-------------|
| ✅ 1.1 | Initialize project: `package.json`, TypeScript, Hono, Drizzle, Tailwind, HTMX |
| ✅ 1.2 | Set up local Postgres database |
| ✅ 1.3 | Define Drizzle schema for all tables, run initial migration |
| ✅ 1.4 | Create base layout (JSX): HTML shell, navbar, sidebar |
| ✅ 1.5 | Implement Google OAuth: login page, callback, session cookie, logout |
| ✅ 1.6 | Auth middleware: protect all routes, redirect to login if unauthenticated |
| ✅ 1.7 | Project CRUD: list, create, edit, delete |
| ✅ 1.8 | Project selection: click a project → scoped sidebar navigation |

**Milestone**: User can log in with Google, create projects, and navigate between them.

---

### Phase 2: Test Cases & Folders
**Goal**: Full test case management with step builder and folder organization.

| Task | Description |
|------|-------------|
| ✅ 2.1 | Test case list page: table with columns (title, priority, type, status, steps count) |
| ✅ 2.2 | Search: HTMX-powered search with debounce |
| ✅ 2.3 | Filters: priority, type, status dropdowns (HTMX partial page updates) |
| ✅ 2.4 | Sorting: click column headers to sort |
| ✅ 2.5 | Pagination: server-side with sliding window page numbers |
| ✅ 2.6 | Create test case form: title, description, preconditions, priority, type, tags |
| ✅ 2.7 | Step builder: add/remove/reorder steps (action, data, expected result) |
| ✅ 2.8 | Edit test case: pre-populated form, update in place |
| ✅ 2.9 | Delete test case: confirmation modal, cascade delete steps |
| ✅ 2.10 | Bulk actions: select multiple → bulk update status or delete |
| ✅ 2.11 | Copy test case: duplicate with "(Copy)" suffix |
| ✅ 2.12 | Folder tree: collapsible tree view in test cases page sidebar/panel |
| ✅ 2.13 | Folder CRUD: create, rename, move, delete folders (with written confirmation) |
| ✅ 2.14 | Assign test cases to folders (via form dropdown or drag-and-drop) |
| ✅ 2.15 | Filter test cases by folder: click a folder to show only its test cases |

**Milestone**: Full CRUD for test cases with search, filter, sort, step builder, and folder organization.

---

### Phase 3: Test Suites
**Goal**: Group test cases into logical suites for organized execution.

| Task | Description |
|------|-------------|
| ✅ 3.1 | Suite list page: table with name, case count, created date |
| ✅ 3.2 | Create suite: name, description |
| ✅ 3.3 | Add test cases to suite: searchable multi-select picker + drag-and-drop tree |
| ✅ 3.4 | Remove test cases from suite (bulk select and remove) |
| 3.5 | Reorder test cases within a suite (drag-and-drop with SortableJS) |
| ✅ 3.6 | Suite detail view: shows all contained test cases with their priority/status |
| ✅ 3.7 | Edit/delete suite |

**Milestone**: Test cases can be organized into suites for structured test execution.

---

### Phase 4: Test Runs & Execution
**Goal**: Execute a test suite, record pass/fail results with comments and GitHub issue links.

> **Terminology**: A Test Run executes a Test Suite. Each test case in the suite gets a Test Result (pass/fail/blocked/skipped) with optional comments and a link to a GitHub issue for bugs.

| Task | Description |
|------|-------------|
| ✅ 4.1 | Create test run: select suite, set name, environment |
| ✅ 4.2 | Auto-populate run with all test cases from the selected suite (status: not_run) |
| ✅ 4.3 | Run execution UI: dedicated read-only test case view with result marking |
| ✅ 4.4 | Mark result per case: pass / fail / blocked / skipped / reset buttons |
| ✅ 4.5 | Add comments per result (EasyMDE markdown editor) |
| ✅ 4.6 | Add GitHub issue link per result (for linking bugs) |
| ✅ 4.7 | Progress bar: pass/fail/blocked counts with percentage |
| ✅ 4.8 | Save progress: run stays in "in_progress", resume later |
| ✅ 4.9 | Complete run: lock results, set completed timestamp. Reopen supported. |
| ✅ 4.10 | Run detail view: full results table with status badges, search, filters, sorting |
| 4.11 | Filter results by status (show only failures) |

**Milestone**: End-to-end test execution workflow — create run, execute, record results with GitHub bug links.

---

### Phase 5: Run History & Dashboard
**Goal**: Historical data, metrics, and trends.

| Task | Description |
|------|-------------|
| 5.1 | ✅ Run history table: all runs for a project, sorted by date |
| 5.2 | ✅ Run summary row: pass/fail/blocked counts, environment, assignee |
| 5.3 | ✅ Click into completed run → view full results |
| 5.4 | ✅ Dashboard: project overview cards (total cases, suites, runs, pass rate) |
| 5.5 | ✅ Pass/fail doughnut chart (Chart.js) on dashboard |
| 5.6 | ✅ Run trend bar chart: pass rate over last 20 runs |
| 5.7 | ✅ Dashboard: projects table + recent runs table |

**Milestone**: Users can track test health over time and spot regressions.

---

### Phase 6: Xray Import
**Goal**: Import existing test cases from Jira Xray Cloud, preserving folder structure.

| Task | Description |
|------|-------------|
| ✅ 6.1 | Settings page: Xray Cloud credentials (Client ID, Client Secret, Project Key) |
| ✅ 6.2 | "Test Connection" button: verify credentials, show project info |
| ✅ 6.3 | Import flow: authenticate → fetch all test cases with folder info (paginated, 100 at a time) |
| ✅ 6.4 | **Folder reconstruction**: parse `folder.path` from each test, create matching folder hierarchy in DB |
| ✅ 6.5 | Preview page: table of test cases to import with field mapping, grouped by folder |
| ✅ 6.6 | Field mapping: Xray priority/status → Kwality Centre enums |
| ✅ 6.7 | Jira wiki markup → HTML/plain text conversion |
| ✅ 6.8 | Execute import: create folders, then test cases + steps in bulk (transactional) |
| ✅ 6.9 | Import summary: "Imported 1,611 test cases across 97 folders. 42 had no steps." |
| ✅ 6.10 | Store `xray_key` and `xray_issue_id` for traceability |
| ✅ 6.11 | Duplicate detection: skip or flag cases that already exist (by xray_key) |
| ✅ 6.12 | Assign each imported test case to its corresponding folder |
| 6.13 | *(Optional)* Attachment download: issue-level via Jira REST API (requires Jira API token) |
| 6.14 | *(Optional)* Attachment download: step-level via Xray REST API (`/api/v2/attachments/{id}`) |
| 6.15 | *(Optional)* Link downloaded attachments to test cases / steps in `attachments` table |

**Xray Folder Data** (from live API scan, Feb 2026):
- 97 unique folder paths discovered
- 906 tests at root level (no folder)
- Top-level categories: Regression (App), Release Specific (App), STAPI, AC v3 (App), Alexa, Firmware
- Deepest nesting: 3 levels (e.g., `/Release Specific (App)/3.40.0/Enviro Notis - Early test`)
- Folder path available via `folder { path, name }` on each test in GraphQL query

**Xray Attachment Data** (from full scan, Feb 2026):
- 210 total attachments across all 1,611 tests
- 27 issue-level (Jira) attachments across 23 test cases — mostly images (PNG)
- 183 step-level (Xray) attachments across 167 steps — mostly screenshots
- Only ~1.4% of test cases have any attachment
- Issue-level download requires Jira API auth (separate from Xray API keys)
- Step-level download requires Xray bearer token

**Milestone**: All existing Xray test cases imported with full data, folder structure, and traceability. Attachments can be imported separately as a follow-up.

---

### Phase 6b: Xray Test Execution Import
**Goal**: Import historical test executions and results from Xray Cloud, linking to already-imported test cases.

> **Prerequisite**: Phase 4 (Test Runs & Execution) and Phase 6 (Xray Test Case Import) must be complete. Test cases must be imported first so `xray_key` exists for linking results to cases.

| Task | Description |
|------|-------------|
| ✅ 6b.1 | "Import Executions" button on the Xray import/settings page |
| ✅ 6b.2 | Fetch all test executions via `getTestExecutions` (paginated, 100 at a time) |
| ✅ 6b.3 | For each execution, create a `test_run` record: name = `"{xray_key}: {summary}"`, map status, set timestamps |
| ✅ 6b.4 | For each test run within an execution, look up the test case by `xray_key` → create `test_result` record |
| ✅ 6b.5 | Status mapping: PASSED→passed, FAILED→failed, BLOCKED→blocked, TO DO→not_run, NOTREQUIRED→skipped, EXECUTING→not_run |
| ✅ 6b.6 | Compute `duration_seconds` from `startedOn`/`finishedOn` where both exist |
| ✅ 6b.7 | Import `comment` as `notes` on each test result |
| ✅ 6b.8 | Set `test_run.started_at` = earliest `startedOn`, `completed_at` = latest `finishedOn` |
| ✅ 6b.9 | Set `test_run.environment` from `testEnvironments[0]` if available |
| ✅ 6b.10 | Import summary: "Imported 52 executions with 468 test results." |
| ✅ 6b.11 | Skip results for test cases not found in DB (log warning with xray_key) |
| ✅ 6b.12 | Duplicate detection: skip executions already imported (by xray_key on test_run name) |

**Xray Execution Data** (from live API scan, Feb 2026):
- 52 test executions containing 468 total test run results
- 29 executions have results, 23 are empty (created but never executed)
- Average 9.0 runs per execution (16.1 among non-empty)
- Date range: **Mar 2021 – Mar 2024** (3 years of history)
- Biggest: TEST-496 "3.10.0 iOS General Testing" with 88 runs
- Status breakdown: 76% PASSED, 9% NOTREQUIRED, 6% FAILED, 6% BLOCKED, 2% EXECUTING, 1% TO DO
- Executions span multiple product areas (App, Firmware, STAPI, Schedules, DR, HomeKit)
- **Import note**: Executions should be separated by product area into different Kwality Centre projects

**Milestone**: Full historical test execution data imported, giving pass/fail trends and run history from day one.

---

### Phase 7: File Attachments
**Goal**: Upload and view files attached to test cases and results. Optionally import attachments from Xray.

| Task | Description |
|------|-------------|
| 7.1 | File upload endpoint: save to `/uploads`, record in `attachments` table |
| 7.2 | Attach files to test results (evidence screenshots, logs) |
| 7.3 | Attach files to test cases (reference documents) |
| 7.4 | Display attachments: thumbnails for images, download links for other files |
| 7.5 | Delete attachment: remove file + DB record |
| 7.6 | nginx config: serve `/uploads/*` as static files |
| 7.7 | *(Optional)* Xray attachment import: download 210 files (27 issue-level + 183 step-level) and link to imported test cases/steps. Requires Jira API token for issue-level attachments |

**Milestone**: Test evidence and documentation can be attached to cases and results.

---

### Phase 8: Polish & Deployment
**Goal**: Production-ready deployment on Digital Ocean.

| Task | Description |
|------|-------------|
| ✅ 8.1 | Error handling: user-friendly 404 page |
| ✅ 8.2 | Toast notifications: success/error feedback on all actions |
| ✅ 8.3 | Loading indicators: HTMX `hx-indicator` spinners + form submit spinners |
| ✅ 8.4 | Empty states: helpful prompts when no data exists |
| 8.5 | Responsive design: ensure usability on tablet screens |
| ✅ 8.6 | Dockerfile + docker-compose.yml (app, postgres, nginx, certbot containers) |
| ✅ 8.7 | Digital Ocean droplet setup guide + init/backup scripts |
| ✅ 8.8 | SSL setup: Let's Encrypt via Certbot (included in deployment guide) |
| 8.9 | CI/CD: GitHub Actions → SSH into VM → `docker compose pull && docker compose up -d` |
| ✅ 8.10 | Postgres backups: automated daily `pg_dump` via cron (14-day retention) |
| ✅ 8.11 | README with setup instructions |

**Milestone**: App is live, secure, and maintainable in production.

---

### Phase 9: Automated Test Integration ✅
**Goal**: Display automated test definitions from GitHub and track execution results.

| Task | Description |
|------|-------------|
| ✅ 9.1 | Project settings: GitHub repo config (owner, repo, branch, test path) |
| ✅ 9.2 | GitHub service: fetch spec files, parse describe/it blocks (Detox + Playwright) |
| ✅ 9.3 | Automated Tests page: spec files grouped by folder with test counts |
| ✅ 9.4 | Automated Runs page: tabular view with date grouping, date/version filters |
| ✅ 9.5 | API endpoint: POST automated test results (`/api/projects/:id/automated-results`) |
| ✅ 9.6 | Run detail page: renders both running-report and test-results.json formats |
| ✅ 9.7 | Historical running report import script (1,459 runs imported) |
| ✅ 9.8 | Sidebar reorganization: Manual and Automated sections |
| ✅ 9.9 | Upload script for CI integration |

**Milestone**: Automated test cases visible from GitHub, results tracked with historical data.

---

### Phase 10: Authorization & Roles ✅
**Goal**: Role-based access control to restrict who can edit vs view.

| Task | Description |
|------|-------------|
| ✅ 10.1 | Three roles: Viewer (read-only), Editor (create/edit), Admin (full + delete + import + user management) |
| ✅ 10.2 | `role` column on users table, default `viewer` |
| ✅ 10.3 | Role included in JWT session token |
| ✅ 10.4 | Server-side route guards: `requireEditor`, `requireAdmin` on all write endpoints |
| ✅ 10.5 | CSS-based UI hiding: action buttons hidden based on user role |
| ✅ 10.6 | Admin user management page: change roles via dropdown |
| ✅ 10.7 | `ADMIN_EMAILS` env var for auto-promoting admins on first login |

**Milestone**: Granular access control — viewers can browse, editors can work, admins can manage.

---

## Key Decisions & Notes

### Authentication: Google Workspace (Company Auth)
- The team uses **Google Workspace** — all company apps authenticate via company Google accounts.
- Google OAuth consent screen should be set to **"Internal"** so only company domain users can log in.
- App-level domain restriction via `ALLOWED_DOMAINS` env var as a safety net (rejects non-company emails even if OAuth consent is misconfigured).
- Users log in with their company Google account (e.g., `name@getmysa.com`). User name, email, and avatar are pulled from Google automatically.

### Deployment: Docker on Digital Ocean
- **Local dev**: Docker Desktop for Postgres; app runs directly via `npm run dev`.
- **Production**: `docker-compose.yml` runs all services (app, postgres, nginx) on a single Digital Ocean droplet ($6-12/mo).
- Deployment via GitHub Actions → SSH → `docker compose pull && docker compose up -d`.

### Data Import: Xray Cloud
- Existing test cases (1,611) live in Jira Xray Cloud (project `TEST`).
- Import uses Xray Cloud GraphQL API (see `docs/xray-api-findings.md` for full data structure).
- Field mapping, wiki markup conversion, and duplicate detection handled in import service.

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kwality_centre

# Google OAuth (set up as "Internal" app in Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Domain restriction (comma-separated list of allowed email domains)
ALLOWED_DOMAINS=getmysa.com

# Xray Cloud (for import feature)
XRAY_CLIENT_ID=your-xray-client-id
XRAY_CLIENT_SECRET=your-xray-client-secret
JIRA_PROJECT_KEY=TEST

# GitHub (for automated test integration)
GITHUB_TOKEN=ghp_your-personal-access-token

# Authorization
ADMIN_EMAILS=your-email@company.com

# API key (for automated results upload)
KC_API_KEY=your-api-key

# App
SESSION_SECRET=random-secret-string-at-least-32-chars
PORT=3000
NODE_ENV=development
UPLOAD_DIR=./uploads
```

## Development Commands

```bash
npm run dev          # Start Hono dev server with hot reload
npm run build        # Compile TypeScript
npm run start        # Start production server
npm run db:generate  # Generate Drizzle migration from schema changes
npm run db:migrate   # Run pending migrations
npm run db:studio    # Open Drizzle Studio (visual DB browser)
```
