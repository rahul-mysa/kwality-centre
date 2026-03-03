# Xray Cloud API — Findings & Data Structure

> Documented from live API query against Jira project `TEST` on Feb 20, 2026.

## Connection Details

- **Xray Version**: Cloud
- **Jira Instance**: Atlassian Cloud (empoweredhomes.atlassian.net)
- **Auth Method**: Xray Cloud API Keys (Client ID + Client Secret)
- **Auth Endpoint**: `POST https://xray.cloud.getxray.app/api/v2/authenticate`
- **Data Endpoint**: `POST https://xray.cloud.getxray.app/api/v2/graphql`

## Authentication Flow

1. Send `client_id` and `client_secret` to the authenticate endpoint
2. Receive a bearer token (plain string, quoted)
3. Use the token in `Authorization: Bearer <token>` header for all subsequent requests

## GraphQL Query Used

```graphql
{
  getTests(jql: "project = TEST AND issuetype = Test", limit: 10) {
    total
    results {
      issueId
          jira(fields: ["key", "summary", "description", "priority", "labels", "status"])
      testType { name }
      steps {
        id
        action
        data
        result
      }
      preconditions(limit: 10) {
        results {
          issueId
          jira(fields: ["summary"])
        }
      }
    }
  }
}
```

### Notes on Query

- `preconditions` requires a `limit` argument (e.g., `limit: 10`) — omitting it causes a 400 error
- `preconditions` uses `results` (not `preconditionRef`) to access nested data
- `jira()` returns an object (not a JSON string) containing the requested Jira fields
- Pagination: use `limit` and `start` parameters on `getTests` to page through results

## Results Summary

- **Total test cases found**: 1,611
- **Test types**: All "Manual"
- **Statuses observed**: "Ready for Review"
- **Priorities observed**: "Triage Required"
- **Labels**: Mostly empty

## Raw Data Structure (Single Test Case)

```json
{
  "issueId": "55148",
  "jira": {
    "key": "TEST-2046",
    "summary": "Check fan forced options for BB1",
    "description": "Make sure the fan forced options - short, medium, long options are added to BB1 settings. Also in final touches screen.",
    "priority": {
      "self": "https://empoweredhomes.atlassian.net/rest/api/2/priority/3",
      "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/0/05/Emblem-question-red.svg",
      "name": "Triage Required",
      "id": "3"
    },
    "labels": [],
    "status": {
      "self": "https://empoweredhomes.atlassian.net/rest/api/2/status/10204",
      "description": "All code approval processes, ending in code merge/deployment for testing.",
      "iconUrl": "https://empoweredhomes.atlassian.net/images/icons/statuses/generic.png",
      "name": "Ready for Review",
      "id": "10204",
      "statusCategory": {
        "self": "https://empoweredhomes.atlassian.net/rest/api/2/statuscategory/4",
        "id": 4,
        "key": "indeterminate",
        "colorName": "yellow",
        "name": "In Progress"
      }
    }
  },
  "testType": {
    "name": "Manual"
  },
  "steps": [
    {
      "id": "f9ed18b3-5736-4c07-b4e6-80b3766aec7a",
      "action": "Set config code to 45B and check schedule events\n\nFan run time settings should not be available",
      "data": "",
      "result": "Fan speed settings should be available - auto, low, high, medium"
    },
    {
      "id": "cc5378df-15be-4aaa-a3c6-395a9673579a",
      "action": "Set config code to 31P and check schedule events\n\nFan run time settings should not be available\n\nFan speed settings should not be available",
      "data": "",
      "result": ""
    }
  ],
  "preconditions": {
    "results": []
  },
  "folder": {
    "path": "/Release Specific (App)/4.12.0",
    "name": "4.12.0"
  }
}
```

## Folder Structure

Tests are organized into a hierarchical folder structure in Xray's Test Repository. The `folder` field is available on each test via the GraphQL query.

**Query to include folder info:**
```graphql
getTests(...) {
  results {
    folder {
      path
      name
    }
  }
}
```

**Note:** The `getFolder(projectId, path)` API requires "view test repository" permissions which may not be available via API keys. However, folder info is available per-test via the `folder` field above.

### Folder Statistics (scanned Feb 2026)
- **97 unique folder paths** across the project
- **906 tests at root level** (no folder / path = "/")
- **Deepest nesting**: 3 levels (e.g., `/Release Specific (App)/3.40.0/Enviro Notis - Early test`)

### Top-Level Folders

| Folder | Tests (approx) |
|--------|---------------|
| `/` (root, unfoldered) | 906 |
| `/Regression (App)/...` | 119 across 17 subfolders |
| `/Release Specific (App)/...` | 181 across 50+ version subfolders |
| `/STAPI/...` | 141 across 6 subfolders |
| `/AC v3 (App)/...` | 65 across 10 subfolders |
| `/Alexa/...` | 48 across 2 subfolders |
| `/Firmware` | 61 |
| `/Unclassified Tests Prior to May 2022/...` | 72 across 4 subfolders |

### Import Strategy
1. Scan all tests to collect unique `folder.path` values
2. Parse paths to reconstruct the tree hierarchy (split by `/`)
3. Create `folders` records top-down (parent before child)
4. Assign each test case to its folder via `folder_id`
5. Tests with `folder.path = "/"` go to root (no folder)

### Other Xray Entities (not test cases)
- **8 Preconditions** — separate issue type, explains count discrepancy (1611 API vs 1619 UI)
- **136 Test Sets** — groups of tests (similar to our suites)
- **69 Test Plans** — higher-level planning entities

## Attachments

Full scan of all 1,611 test cases performed Feb 2026.

### Summary

| Attachment Type | Files | Across |
|-----------------|-------|--------|
| Issue-level (Jira attachments) | 27 | 23 test cases |
| Step-level (Xray step attachments) | 183 | 167 steps |
| **Total** | **210** | ~1.4% of test cases have any attachment |

### Issue-Level Attachments

Attached to the Jira issue itself. Available via `jira(fields: ["attachment"])`.

```graphql
getTests(...) {
  results {
    jira(fields: ["key", "attachment"])
  }
}
```

Response includes:
- `filename` — original file name (e.g., `IMG_1181.PNG`)
- `mimeType` — e.g., `image/png`
- `size` — file size in bytes
- `content` — Jira REST download URL (e.g., `https://<instance>.atlassian.net/rest/api/2/attachment/content/21032`)

**Download requires Jira API authentication** (API token or PAT), separate from Xray API keys.

### Step-Level Attachments

Attached to individual test steps. Available via `steps { attachments { ... } }`.

```graphql
getTests(...) {
  results {
    steps {
      attachments {
        id
        filename
      }
    }
  }
}
```

Response includes:
- `id` — Xray attachment UUID
- `filename` — original file name

**Download via Xray REST API**: `GET /api/v2/attachments/{id}` with Bearer token.

### Import Strategy for Attachments

Recommended **two-phase approach**:
1. **Phase 1**: Import all test cases, steps, folders, and metadata — skip attachments
2. **Phase 2**: Optionally download attachments (requires Jira API credentials for issue-level, Xray token for step-level)

Rationale: Only 210 files across 1.4% of tests. Not worth blocking the main import on additional credential setup.

## Test Executions

Full scan of all test executions performed Feb 2026.

### Summary

| Metric | Value |
|--------|-------|
| Total test executions | 52 |
| Total test run results | 468 |
| Executions with results | 29 (23 are empty — created but never executed) |
| Avg runs per execution | 9.0 (16.1 among non-empty) |
| Date range | **Mar 2021 – Mar 2024** (3 years of history) |

### Status Distribution (sampled 101 runs across 10 executions)

| Status | Count | % |
|--------|-------|---|
| PASSED | 77 | 76% |
| NOTREQUIRED | 9 | 9% |
| FAILED | 6 | 6% |
| BLOCKED | 6 | 6% |
| EXECUTING | 2 | 2% |
| TO DO | 1 | 1% |

### GraphQL Query for Executions

```graphql
{
  getTestExecutions(jql: "project = TEST", limit: 100, start: 0) {
    total
    results {
      issueId
      jira(fields: ["key", "summary", "status", "created"])
      testEnvironments
      testRuns(limit: 100) {
        total
        results {
          status { name color description }
          startedOn
          finishedOn
          comment
          test {
            issueId
            jira(fields: ["key", "summary"])
          }
          steps {
            id
            action
            data
            result
            status { name }
            actualResult
            comment
          }
          evidence {
            filename
            downloadLink
          }
        }
      }
    }
  }
}
```

### Raw Data Structure (Sample Test Execution)

The following is a real execution (`TEST-1965`: "DR Enrolment Page Tests") containing 16 test runs. Shown below are 3 representative runs — one PASSED with per-step results, one NOTREQUIRED with failed steps, and one PASSED without steps.

```json
{
  "issueId": "49059",
  "jira": {
    "key": "TEST-1965",
    "summary": "DR Enrolment Page Tests",
    "created": "2024-03-15T09:07:18.658-0230",
    "status": {
      "name": "Done",
      "statusCategory": { "key": "done", "colorName": "green" }
    }
  },
  "testEnvironments": [],
  "testRuns": {
    "total": 16,
    "results": [
      {
        "status": { "name": "PASSED", "color": "#95C160" },
        "startedOn": "2024-03-15T12:32:28.148Z",
        "finishedOn": "2024-03-18T13:57:38.111Z",
        "comment": null,
        "test": {
          "issueId": "48352",
          "jira": { "key": "TEST-1921", "summary": "DR Enrolment - Expected Flow of Pages" }
        },
        "steps": [
          {
            "id": "a72611e1-...",
            "action": "Login: select Forgot your password?",
            "data": null,
            "result": "Reset Password page",
            "status": { "name": "PASSED" },
            "actualResult": null,
            "comment": null
          },
          {
            "id": "f78e33d3-...",
            "action": "Login: enter valid login info and select Sign In",
            "data": null,
            "result": "Home Dashboard page",
            "status": { "name": "PASSED" },
            "actualResult": null,
            "comment": null
          }
        ],
        "evidence": []
      },
      {
        "status": { "name": "NOTREQUIRED", "color": "#4f5296" },
        "startedOn": "2024-03-15T12:36:59.949Z",
        "finishedOn": null,
        "comment": null,
        "test": {
          "issueId": "48355",
          "jira": { "key": "TEST-1924", "summary": "DR Enrolment - Login - Forgot Password" }
        },
        "steps": [
          {
            "id": "8a64bd6f-...",
            "action": "From the login page, select \"Forgot your Password?\"",
            "data": null,
            "result": "Reset Password page is displayed.",
            "status": { "name": "FAILED" },
            "actualResult": null,
            "comment": null
          }
        ],
        "evidence": []
      },
      {
        "status": { "name": "PASSED", "color": "#95C160" },
        "startedOn": "2024-03-15T12:13:26.495Z",
        "finishedOn": "2024-03-15T12:13:26.495Z",
        "comment": null,
        "test": {
          "issueId": "48353",
          "jira": { "key": "TEST-1922", "summary": "DR Enrolment - Login - Correct Account Info" }
        },
        "steps": [],
        "evidence": []
      }
    ]
  }
}
```

### Data Structure Explained

**Execution level** (`getTestExecutions`):
- `issueId` / `jira.key` — Jira issue that represents the execution
- `jira.summary` — Name of the execution
- `jira.status` — Overall execution status (Done, In Progress, etc.)
- `jira.created` — When the execution was created
- `testEnvironments` — Array of environment names (mostly empty in this project)
- `testRuns` — All individual test results within this execution

**Test Run level** (`testRuns.results[]`):
- `status.name` — Result: PASSED, FAILED, BLOCKED, NOTREQUIRED, EXECUTING, TO DO
- `startedOn` / `finishedOn` — Timestamps (ISO 8601, nullable)
- `comment` — Tester notes (nullable)
- `test.issueId` / `test.jira.key` — Which test case was executed (links to our imported tests)
- `steps[]` — Per-step execution results (may be empty if tester didn't record step-by-step)
- `evidence[]` — Attached files (screenshots, logs) from the execution

**Step-level results** (`testRuns.results[].steps[]`):
- `status.name` — Individual step result (PASSED, FAILED, etc.)
- `actualResult` — What actually happened (usually null — testers rarely fill this in)
- `comment` — Tester comment on the step (usually null)

### Execution → Kwality Centre Mapping

| Xray Field | Kwality Centre Table | Field | Notes |
|------------|---------------------|-------|-------|
| Test Execution (issue) | `test_runs` | — | One execution = one test run |
| `jira.key` | `test_runs` | `name` | e.g., "TEST-1965: DR Enrolment Page Tests" |
| `jira.status.statusCategory.key` | `test_runs` | `status` | done → completed, indeterminate → in_progress, new → planned |
| `jira.created` | `test_runs` | `created_at` | Execution creation date |
| `testRuns[].startedOn` (earliest) | `test_runs` | `started_at` | Earliest start across all runs |
| `testRuns[].finishedOn` (latest) | `test_runs` | `completed_at` | Latest finish across all runs |
| `testEnvironments[0]` | `test_runs` | `environment` | First environment, if any |
| Test Run (per test) | `test_results` | — | One run = one result row |
| `testRuns[].test.jira.key` | `test_results` | `test_case_id` | Look up by `xray_key` |
| `testRuns[].status.name` | `test_results` | `status` | PASSED→passed, FAILED→failed, BLOCKED→blocked, TO DO→not_run, NOTREQUIRED→skipped |
| `testRuns[].startedOn` | `test_results` | `executed_at` | When this specific test was run |
| `testRuns[].comment` | `test_results` | `notes` | Tester notes |
| `finishedOn - startedOn` | `test_results` | `duration_seconds` | Computed if both timestamps exist |

### Execution Import Strategy

1. Import test cases first (so `xray_key` exists for linking)
2. Fetch all 52 executions with their test runs (paginated)
3. For each execution, create a `test_run` record
4. For each test run within, look up the test case by `xray_key`, create a `test_result` record
5. Map statuses using the table above
6. Skip test runs that reference test cases not found in our DB (edge case)

### Product Areas Covered

Executions span multiple product areas within the single `TEST` Jira project:

| Area | Examples | Approx. Executions |
|------|----------|-------------------|
| App releases | 3.10.0, 3.23, 3.24 iOS/Android testing | ~10 |
| Firmware | 3.4.x, 3.12.x, 3.16.x across BB, INF, AC | ~8 |
| STAPI (API) | Command/control, telemetry, user endpoints | ~6 |
| Schedules | v2 schedule testing sets A/B/C | ~10 |
| DR Enrolment | Demand Response web portal | ~2 |
| HomeKit | Certification functional tests | ~1 |
| Other | Ad-hoc, smoke tests, Android/iOS beta | ~15 |

**Import note**: When importing executions, they should be separated by product area into different projects in Kwality Centre rather than lumped into one.

### Cross-Project Executions (MYSA project)

Executions also exist under the **MYSA** Jira project, not just TEST. These are more recent:
- `MYSA-7635`: "App 4.13.1/2 Testing (iOS/Andr)" — Feb 2026, 40 test runs, all PASSED/NOTREQUIRED
- Test cases referenced from MYSA executions still use `TEST-xxx` keys (cross-project linking)
- **Import approach**: Query by execution key (`key = MYSA-7635`) rather than by project, since tests cross projects

**Import script**: `scripts/import-execution.mjs` — imports a single execution by Jira key:
```bash
node scripts/import-execution.mjs MYSA-7635
```

Features:
- Links results to test cases by `xray_key` lookup
- Extracts GitHub issue URLs from comments as `defect_url`
- Converts Jira wiki markup in comments
- Computes `started_at` / `completed_at` from individual run timestamps
- Duplicate detection by run name prefix

### Observations

- Most test runs have **no `actualResult`** or `comment` — testers used pass/fail toggles without notes
- Step-level results exist for some runs but not all
- `evidence` array is mostly empty (attachments are rare in executions too)
- 23 of 52 TEST-project executions have 0 test runs (created but never executed)
- `finishedOn` is sometimes `null` even for passed tests (set to same as `startedOn` or left blank)
- Biggest single execution: `TEST-496` "3.10.0 iOS General Testing" with 88 test runs
- Earliest execution: `TEST-265` (March 18, 2021)
- **Date range is wider than initially thought**: TEST project has Mar 2021 – Mar 2024, but MYSA project has executions up to Feb 2026

## Field Mapping — Xray to Kwality Centre

| Xray Field | Type | Kwality Centre Field | Notes |
|------------|------|---------------------|-------|
| `jira.key` | string | `xrayKey` | The human-readable Jira key (e.g., `TEST-2045`). Must request via `jira(fields: ["key"])` |
| `issueId` | string (numeric) | `xrayIssueId` | Internal Jira ID (e.g., `55082`). **Not** the same as the Jira key |
| `folder.path` | string | `folder_id` (FK) | Parse path, create folder hierarchy, link test case to leaf folder |
| `jira.summary` | string | `title` | Direct mapping |
| `jira.description` | string \| null | `description` | Often null; import as empty string |
| `jira.priority.name` | string | `priority` | Map: "Triage Required" → "medium" (default) |
| `jira.priority.id` | string | — | Can be used for custom mapping |
| `jira.status.name` | string | `status` | Map: "Ready for Review" → "active" |
| `jira.status.statusCategory.key` | string | — | "indeterminate", "done", "new", etc. |
| `jira.labels` | string[] | `tags` | Direct mapping |
| `testType.name` | string | `type` | Map: "Manual" → "functional" (default) |
| `steps[].id` | UUID string | — | Xray internal step ID, not needed |
| `steps[].action` | string | `steps[].action` | May contain Jira wiki markup |
| `steps[].data` | string | `steps[].data` | Test data for the step |
| `steps[].result` | string | `steps[].expectedResult` | May contain Jira wiki markup |
| `preconditions.results[]` | array | `preconditions` | Linked precondition issues |

## Data Observations

### Content Formatting
- Step actions and results contain **Jira wiki markup**:
  - `{noformat}...{noformat}` — preformatted code blocks
  - `[text|url]` — hyperlinks
  - Newlines (`\n`) for line breaks
- **Recommendation**: Strip or convert wiki markup during import (convert `{noformat}` to markdown code blocks, `[text|url]` to `[text](url)`)

### Data Quality
- Many test cases have **no steps** (just a title/summary)
- Some steps have **empty `result` fields** (expected result not documented)
- **Priority is mostly "Triage Required"** — suggests priorities weren't actively managed in Xray
- **Labels are mostly empty** — tagging will be a new practice in Kwality Centre
- Some step actions embed expected results within the action text

### Pagination
- Total: 1,611 test cases
- API returns paginated results via `limit` and `start` parameters
- Full import will need to loop with `limit: 100, start: 0, 100, 200, ...` until all fetched

## Priority Mapping Table

| Xray Priority | Xray ID | Kwality Centre Priority |
|---------------|---------|------------------------|
| Highest | 1 | critical |
| High | 2 | high |
| Triage Required | 3 | medium (default) |
| Medium | 6 | medium |
| Low | 4 | low |
| Lowest | 5 | low |

## Status Mapping Table

| Xray Status | Status Category | Kwality Centre Status |
|-------------|----------------|----------------------|
| To Do | new | draft |
| In Progress | indeterminate | active |
| Ready for Review | indeterminate | active |
| Done | done | active |
| Deprecated | — | deprecated |

## API Rate Limits & Considerations

- Xray Cloud GraphQL API does not have strict documented rate limits but best practice is to batch requests
- Use `limit: 100` per request for efficient pagination
- Bearer tokens are short-lived — re-authenticate if token expires during large imports
- The `jira()` field resolver adds latency — request only needed fields
