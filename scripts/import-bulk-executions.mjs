import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const XRAY_AUTH_URL = "https://xray.cloud.getxray.app/api/v2/authenticate";
const XRAY_GRAPHQL_URL = "https://xray.cloud.getxray.app/api/v2/graphql";

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL);

const JIRA_PROJECT = process.argv[2];
const TARGET_KC_PROJECT = process.argv[3];

if (!JIRA_PROJECT) {
  console.error("Usage: node scripts/import-bulk-executions.mjs <JIRA_PROJECT> [KC_PROJECT_NAME]");
  console.error("  e.g. node scripts/import-bulk-executions.mjs EM Firmware");
  console.error("  e.g. node scripts/import-bulk-executions.mjs TEST auto");
  console.error('  "auto" routes TEST executions to KC projects by content');
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
  return result.trim() || null;
}

function routeTestExecution(summary) {
  const s = (summary || "").toLowerCase();
  if (s.includes("stapi") || s.includes("telemetry") || s.includes("user api") || s.includes("command and control")) return "STAPI";
  if (s.includes("firmware") || s.includes("fw ") || s.includes("test rack")) return "Firmware";
  if (s.includes("homekit")) return "Firmware";
  return "Mysa App";
}

async function main() {
  const kcProjects = await sql`SELECT id, name FROM projects`;
  const projectMap = new Map();
  for (const p of kcProjects) projectMap.set(p.name, p.id);

  let targetProjectId = null;
  const isAutoRoute = TARGET_KC_PROJECT === "auto";

  if (!isAutoRoute) {
    const targetName = TARGET_KC_PROJECT || JIRA_PROJECT;
    targetProjectId = projectMap.get(targetName);
    if (!targetProjectId) {
      console.error(`KC project "${targetName}" not found. Available: ${[...projectMap.keys()].join(", ")}`);
      process.exit(1);
    }
    console.log(`Target KC project: ${targetName} (${targetProjectId})`);
  } else {
    console.log("Auto-routing TEST executions to KC projects by content");
  }

  const users = await sql`SELECT id, name FROM users ORDER BY created_at LIMIT 1`;
  if (users.length === 0) { console.error("No users found"); process.exit(1); }
  const user = users[0];
  console.log(`Import user: ${user.name}`);

  // Build xray_key lookup across ALL projects
  const testCases = await sql`SELECT id, xray_key, project_id FROM test_cases WHERE xray_key IS NOT NULL`;
  const keyToId = new Map();
  const keyToProject = new Map();
  for (const tc of testCases) {
    keyToId.set(tc.xray_key, tc.id);
    keyToProject.set(tc.xray_key, tc.project_id);
  }
  console.log(`Loaded ${keyToId.size} test cases with xray_key for linking`);

  // Load existing run names to skip duplicates
  const existingRuns = await sql`SELECT name FROM test_runs`;
  const existingNames = new Set(existingRuns.map(r => r.name));

  console.log(`\nAuthenticating with Xray...`);
  const token = await authenticate();

  // Fetch all executions for the Jira project
  let start = 0;
  const limit = 100;
  let allExecs = [];
  let total = 0;

  while (true) {
    const data = await graphql(token, `{
      getTestExecutions(jql: "project = ${JIRA_PROJECT}", limit: ${limit}, start: ${start}) {
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
      break;
    }

    const execs = data.data?.getTestExecutions;
    total = execs?.total || 0;
    const results = execs?.results || [];
    if (results.length === 0) break;

    allExecs.push(...results);
    start += limit;
    process.stderr.write(`  Fetched ${allExecs.length} of ${total} executions...\n`);

    if (allExecs.length >= total || results.length < limit) break;
  }

  console.log(`\nFetched ${allExecs.length} executions from ${JIRA_PROJECT}`);

  let importedRuns = 0;
  let importedResults = 0;
  let skippedEmpty = 0;
  let skippedDupe = 0;
  let notFoundTotal = 0;
  const routingStats = {};

  for (let i = 0; i < allExecs.length; i++) {
    const exec = allExecs[i];
    const jira = typeof exec.jira === "string" ? JSON.parse(exec.jira) : exec.jira;
    const runs = exec.testRuns?.results || [];
    const runTotal = exec.testRuns?.total || 0;

    if (runTotal === 0) {
      skippedEmpty++;
      continue;
    }

    const runName = `${jira.key}: ${jira.summary}`;

    if (existingNames.has(runName)) {
      skippedDupe++;
      continue;
    }

    // Determine target project
    let projId = targetProjectId;
    let projName = TARGET_KC_PROJECT;
    if (isAutoRoute) {
      projName = routeTestExecution(jira.summary);
      projId = projectMap.get(projName);
      if (!projId) {
        console.warn(`  No KC project for "${projName}", defaulting to Mysa App`);
        projName = "Mysa App";
        projId = projectMap.get("Mysa App");
      }
    }

    routingStats[projName] = (routingStats[projName] || 0) + 1;

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

    const [newRun] = await sql`
      INSERT INTO test_runs (project_id, name, status, environment, started_at, completed_at, created_by, created_at, updated_at)
      VALUES (
        ${projId},
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

    existingNames.add(runName);
    let runResults = 0;

    for (const run of runs) {
      const testJira = typeof run.test?.jira === "string" ? JSON.parse(run.test.jira) : run.test?.jira;
      const testKey = testJira?.key;
      if (!testKey) continue;

      const testCaseId = keyToId.get(testKey);
      if (!testCaseId) {
        notFoundTotal++;
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

      runResults++;
      importedResults++;
    }

    importedRuns++;
    process.stdout.write(`  [${i + 1}/${allExecs.length}] ${jira.key}: ${runResults} results → ${projName}\n`);
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`  Runs imported: ${importedRuns}`);
  console.log(`  Results imported: ${importedResults}`);
  console.log(`  Skipped (empty): ${skippedEmpty}`);
  console.log(`  Skipped (duplicate): ${skippedDupe}`);
  console.log(`  Test cases not found: ${notFoundTotal}`);
  if (Object.keys(routingStats).length > 0) {
    console.log(`  Routing:`);
    for (const [proj, count] of Object.entries(routingStats)) {
      console.log(`    ${proj}: ${count} runs`);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
