import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const XRAY_AUTH_URL = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL = "https://xray.cloud.getxray.app/api/v2/graphql";

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL);

const JIRA_PROJECT = process.argv[2];
if (!JIRA_PROJECT) {
  console.error("Usage: node scripts/import-all-executions.mjs MYSA");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

async function authenticate() {
  const res = await fetch(XRAY_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: XRAY_CLIENT_ID, client_secret: XRAY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  return (await res.text()).replace(/"/g, "");
}

async function graphql(token, query) {
  const res = await fetch(XRAY_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
  return res.json();
}

function mapStatus(xrayStatus) {
  if (!xrayStatus) return "not_run";
  const s = xrayStatus.toUpperCase();
  if (s === "PASSED" || s === "PASS") return "passed";
  if (s === "FAILED" || s === "FAIL") return "failed";
  if (s === "BLOCKED") return "blocked";
  if (s === "NOTREQUIRED" || s === "NOT REQUIRED") return "skipped";
  return "not_run";
}

function mapRunStatus(jiraStatus) {
  if (!jiraStatus) return "planned";
  const cat = jiraStatus.statusCategory?.key;
  if (cat === "done") return "completed";
  if (cat === "indeterminate") return "in_progress";
  return "planned";
}

function convertWikiMarkup(text) {
  if (!text) return null;
  let result = text;
  result = result.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, "```\n$1\n```");
  result = result.replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/g, "```\n$1\n```");
  result = result.replace(/\[([^|]+)\|([^\]]+)\]/g, "[$1]($2)");
  result = result.replace(/\{color:[^}]*\}([\s\S]*?)\{color\}/g, "$1");
  result = result.replace(/\{\{([^}]+)\}\}/g, "`$1`");

  const lines = result.split("\n");
  const out = [];
  let didSeparator = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("||") && t.endsWith("||")) {
      const cells = t.split("||").filter(Boolean);
      out.push("| " + cells.map((c) => c.replace(/\*/g, "")).join(" | ") + " |");
      out.push("|" + cells.map(() => " --- ").join("|") + "|");
      didSeparator = true;
    } else if (didSeparator && t.startsWith("|") && t.endsWith("|")) {
      const cells = t.slice(1, -1).split("|");
      out.push("| " + cells.join(" | ") + " |");
    } else {
      didSeparator = false;
      out.push(line);
    }
  }
  result = out.join("\n");
  return result.trim() || null;
}

async function main() {
  console.log(`\n=== Import all executions from project: ${JIRA_PROJECT} ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  // 1. Get project & user
  const projects = await sql`SELECT id, name FROM projects ORDER BY created_at LIMIT 1`;
  if (projects.length === 0) { console.error("No projects"); process.exit(1); }
  const project = projects[0];
  console.log(`Target: ${project.name} (${project.id})`);

  const users = await sql`SELECT id, name FROM users ORDER BY created_at LIMIT 1`;
  const user = users[0];

  // 2. Build xray_key -> test_case_id lookup
  const testCases = await sql`SELECT id, xray_key FROM test_cases WHERE project_id = ${project.id} AND xray_key IS NOT NULL`;
  const keyToId = new Map();
  for (const tc of testCases) keyToId.set(tc.xray_key, tc.id);
  console.log(`Loaded ${keyToId.size} test cases for linking`);

  // 3. Get existing run names for duplicate detection
  const existingRuns = await sql`SELECT name FROM test_runs WHERE project_id = ${project.id}`;
  const existingNames = new Set(existingRuns.map((r) => r.name));

  // 4. Authenticate
  console.log("\nAuthenticating...");
  const token = await authenticate();

  // 5. Fetch all executions (paginated)
  console.log(`Fetching executions from ${JIRA_PROJECT}...`);
  const allExecs = [];
  let start = 0;
  while (true) {
    const data = await graphql(token, `{
      getTestExecutions(jql: "project = ${JIRA_PROJECT}", limit: 100, start: ${start}) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status", "created"])
          testEnvironments
          testRuns(limit: 100) {
            total
            results {
              status { name }
              startedOn
              finishedOn
              comment
              test {
                issueId
                jira(fields: ["key", "summary"])
              }
            }
          }
        }
      }
    }`);

    if (data.errors) {
      console.error("GraphQL errors:", JSON.stringify(data.errors, null, 2));
      break;
    }

    const execs = data.data?.getTestExecutions;
    const batch = execs?.results || [];
    allExecs.push(...batch);
    const total = execs?.total || 0;
    console.log(`  Fetched ${allExecs.length} of ${total}`);
    if (allExecs.length >= total || batch.length === 0) break;
    start += 100;
  }

  console.log(`\nTotal executions found: ${allExecs.length}`);

  // 6. Import each execution
  let importedRuns = 0;
  let skippedRuns = 0;
  let totalResults = 0;
  let notFoundKeys = [];

  for (const exec of allExecs) {
    const jira = typeof exec.jira === "string" ? JSON.parse(exec.jira) : exec.jira;
    const runName = `${jira.key}: ${jira.summary}`;
    const runs = exec.testRuns?.results || [];

    if (existingNames.has(runName)) {
      skippedRuns++;
      process.stdout.write(`  SKIP (duplicate): ${jira.key}\r`);
      continue;
    }

    if (runs.length === 0) {
      skippedRuns++;
      continue;
    }

    // Compute timestamps
    let earliestStart = null;
    let latestFinish = null;
    for (const run of runs) {
      if (run.startedOn) {
        const d = new Date(run.startedOn);
        if (!earliestStart || d < earliestStart) earliestStart = d;
      }
      if (run.finishedOn) {
        const d = new Date(run.finishedOn);
        if (!latestFinish || d > latestFinish) latestFinish = d;
      }
    }

    const runStatus = mapRunStatus(jira.status);
    const createdAt = jira.created ? new Date(jira.created) : new Date();

    if (DRY_RUN) {
      console.log(`  WOULD IMPORT: ${jira.key} — "${jira.summary}" (${runs.length} results, status: ${runStatus})`);
      importedRuns++;
      totalResults += runs.length;
      continue;
    }

    const [newRun] = await sql`
      INSERT INTO test_runs (project_id, name, status, environment, started_at, completed_at, created_by, created_at, updated_at)
      VALUES (
        ${project.id}, ${runName}, ${runStatus},
        ${exec.testEnvironments?.[0] || null},
        ${earliestStart},
        ${runStatus === "completed" ? latestFinish : null},
        ${user.id}, ${createdAt}, ${createdAt}
      )
      RETURNING id
    `;

    let runResults = 0;
    for (const run of runs) {
      const testJira = typeof run.test?.jira === "string" ? JSON.parse(run.test.jira) : run.test?.jira;
      const testKey = testJira?.key;
      if (!testKey) continue;

      const testCaseId = keyToId.get(testKey);
      if (!testCaseId) {
        notFoundKeys.push(testKey);
        continue;
      }

      const status = mapStatus(run.status?.name);
      const notes = convertWikiMarkup(run.comment);
      const executedAt = run.startedOn ? new Date(run.startedOn) : null;

      let durationSeconds = null;
      if (run.startedOn && run.finishedOn) {
        durationSeconds = Math.round((new Date(run.finishedOn) - new Date(run.startedOn)) / 1000);
        if (durationSeconds < 0) durationSeconds = null;
      }

      let defectUrl = null;
      if (notes) {
        const ghMatch = notes.match(/https:\/\/github\.com\/[^\s)\]|]+\/issues\/\d+/);
        if (ghMatch) defectUrl = ghMatch[0];
      }

      await sql`
        INSERT INTO test_results (run_id, test_case_id, status, notes, defect_url, duration_seconds, executed_by, executed_at, created_at, updated_at)
        VALUES (
          ${newRun.id}, ${testCaseId}, ${status}, ${notes}, ${defectUrl}, ${durationSeconds},
          ${status !== "not_run" ? user.id : null},
          ${executedAt}, ${executedAt || createdAt}, ${executedAt || createdAt}
        )
      `;
      runResults++;
    }

    importedRuns++;
    totalResults += runResults;
    process.stdout.write(`  Imported ${importedRuns}: ${jira.key} (${runResults} results)                    \r`);
  }

  console.log(`\n\n=== Import Complete ===`);
  console.log(`  Executions imported: ${importedRuns}`);
  console.log(`  Executions skipped:  ${skippedRuns} (duplicates or empty)`);
  console.log(`  Total results:       ${totalResults}`);
  if (notFoundKeys.length > 0) {
    const unique = [...new Set(notFoundKeys)];
    console.log(`  Test cases not found: ${unique.length} unique keys`);
    console.log(`    ${unique.slice(0, 10).join(", ")}${unique.length > 10 ? "..." : ""}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
