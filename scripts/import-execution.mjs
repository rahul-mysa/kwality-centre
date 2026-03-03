import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const XRAY_AUTH_URL = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL = "https://xray.cloud.getxray.app/api/v2/graphql";

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL);

const EXECUTION_KEY = process.argv[2];
if (!EXECUTION_KEY) {
  console.error("Usage: node scripts/import-execution.mjs MYSA-7635");
  process.exit(1);
}

async function authenticate() {
  const res = await fetch(XRAY_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: XRAY_CLIENT_ID, client_secret: XRAY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const token = await res.text();
  return token.replace(/"/g, "");
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
  // TO DO, EXECUTING, or anything else
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

  // Jira wiki tables: ||header||header|| rows become markdown tables with separator
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
  console.log(`\n=== Importing execution: ${EXECUTION_KEY} ===\n`);

  // 1. Find the Kwality Centre project
  const projects = await sql`SELECT id, name FROM projects ORDER BY created_at LIMIT 1`;
  if (projects.length === 0) {
    console.error("No projects found in database");
    process.exit(1);
  }
  const project = projects[0];
  console.log(`Target project: ${project.name} (${project.id})`);

  // 2. Get dev user
  const users = await sql`SELECT id, name FROM users ORDER BY created_at LIMIT 1`;
  if (users.length === 0) {
    console.error("No users found in database");
    process.exit(1);
  }
  const user = users[0];
  console.log(`Import user: ${user.name} (${user.id})`);

  // 3. Build lookup: xray_key -> test_case id
  const testCases = await sql`SELECT id, xray_key FROM test_cases WHERE project_id = ${project.id} AND xray_key IS NOT NULL`;
  const keyToId = new Map();
  for (const tc of testCases) {
    keyToId.set(tc.xray_key, tc.id);
  }
  console.log(`Loaded ${keyToId.size} test cases with xray_key for linking`);

  // 4. Check for duplicate (already imported)
  const existing = await sql`SELECT id FROM test_runs WHERE project_id = ${project.id} AND name LIKE ${EXECUTION_KEY + ':%'}`;
  if (existing.length > 0) {
    console.error(`\nExecution already imported: run ID ${existing[0].id}`);
    console.error("Delete it first if you want to re-import.");
    process.exit(1);
  }

  // 5. Authenticate with Xray
  console.log("\nAuthenticating with Xray...");
  const token = await authenticate();

  // 6. Fetch the execution
  console.log(`Fetching ${EXECUTION_KEY}...`);
  const data = await graphql(token, `{
    getTestExecutions(jql: "key = ${EXECUTION_KEY}", limit: 1) {
      total
      results {
        issueId
        jira(fields: ["key", "summary", "status", "created"])
        testEnvironments
        testRuns(limit: 100) {
          total
          results {
            status { name color }
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
    process.exit(1);
  }

  const execs = data.data?.getTestExecutions?.results || [];
  if (execs.length === 0) {
    console.error(`Execution ${EXECUTION_KEY} not found`);
    process.exit(1);
  }

  const exec = execs[0];
  const jira = typeof exec.jira === "string" ? JSON.parse(exec.jira) : exec.jira;
  const runs = exec.testRuns?.results || [];

  console.log(`\nExecution: ${jira.key}: ${jira.summary}`);
  console.log(`Status: ${jira.status?.name}`);
  console.log(`Created: ${jira.created}`);
  console.log(`Environments: ${JSON.stringify(exec.testEnvironments)}`);
  console.log(`Test runs: ${exec.testRuns?.total} (fetched ${runs.length})`);

  // 7. Compute run-level timestamps from individual results
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

  // 8. Create test_run record
  const runName = `${jira.key}: ${jira.summary}`;
  const runStatus = mapRunStatus(jira.status);
  const createdAt = jira.created ? new Date(jira.created) : new Date();

  const [newRun] = await sql`
    INSERT INTO test_runs (project_id, name, status, environment, started_at, completed_at, created_by, created_at, updated_at)
    VALUES (
      ${project.id},
      ${runName},
      ${runStatus},
      ${exec.testEnvironments?.[0] || null},
      ${earliestStart},
      ${runStatus === "completed" ? latestFinish : null},
      ${user.id},
      ${createdAt},
      ${createdAt}
    )
    RETURNING id
  `;

  console.log(`\nCreated test run: ${newRun.id}`);
  console.log(`  Name: ${runName}`);
  console.log(`  Status: ${runStatus}`);
  console.log(`  Started: ${earliestStart?.toISOString() || "—"}`);
  console.log(`  Completed: ${latestFinish?.toISOString() || "—"}`);

  // 9. Create test_result records
  let imported = 0;
  let skipped = 0;
  let notFound = 0;
  const notFoundKeys = [];

  for (const run of runs) {
    const testJira = typeof run.test?.jira === "string" ? JSON.parse(run.test.jira) : run.test?.jira;
    const testKey = testJira?.key;

    if (!testKey) {
      skipped++;
      continue;
    }

    const testCaseId = keyToId.get(testKey);
    if (!testCaseId) {
      notFound++;
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

    // Extract GitHub issue URLs from comments as defect_url
    let defectUrl = null;
    if (notes) {
      const ghMatch = notes.match(/https:\/\/github\.com\/[^\s)\]|]+\/issues\/\d+/);
      if (ghMatch) defectUrl = ghMatch[0];
    }

    await sql`
      INSERT INTO test_results (run_id, test_case_id, status, notes, defect_url, duration_seconds, executed_by, executed_at, created_at, updated_at)
      VALUES (
        ${newRun.id},
        ${testCaseId},
        ${status},
        ${notes},
        ${defectUrl},
        ${durationSeconds},
        ${status !== "not_run" ? user.id : null},
        ${executedAt},
        ${executedAt || createdAt},
        ${executedAt || createdAt}
      )
    `;

    imported++;
    process.stdout.write(`  Imported ${imported}/${runs.length}: ${testKey} → ${status}\r`);
  }

  console.log(`\n\n=== Import Complete ===`);
  console.log(`  Results imported: ${imported}`);
  console.log(`  Skipped (no key): ${skipped}`);
  console.log(`  Not found in DB:  ${notFound}`);
  if (notFoundKeys.length > 0) {
    console.log(`  Missing keys: ${notFoundKeys.join(", ")}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
