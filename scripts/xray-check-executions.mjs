import { config } from "dotenv";
config({ path: ".env.local" });

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, JIRA_PROJECT_KEY } = process.env;

async function authenticate() {
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: XRAY_CLIENT_ID, client_secret: XRAY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const token = await res.text();
  return token.replace(/"/g, "");
}

async function graphql(token, query) {
  const res = await fetch("https://xray.cloud.getxray.app/api/v2/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
  return res.json();
}

async function main() {
  const token = await authenticate();
  console.log("Authenticated!\n");

  // 1. Count test executions
  console.log("=== TEST EXECUTIONS ===\n");
  const execCount = await graphql(token, `{
    getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 1) {
      total
    }
  }`);

  if (execCount.errors) {
    console.log("Execution query errors:", JSON.stringify(execCount.errors, null, 2));
  } else {
    const total = execCount.data?.getTestExecutions?.total || 0;
    console.log(`Total test executions: ${total}\n`);
  }

  // 2. Fetch sample executions with details
  console.log("=== SAMPLE EXECUTIONS (first 5) ===\n");
  const execSample = await graphql(token, `{
    getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 5) {
      total
      results {
        issueId
        jira(fields: ["key", "summary", "status", "created"])
        testEnvironments
        testRuns(limit: 5) {
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
          }
        }
      }
    }
  }`);

  if (execSample.errors) {
    console.log("Sample query errors:", JSON.stringify(execSample.errors, null, 2));
  } else {
    const execs = execSample.data?.getTestExecutions;
    console.log(`Showing ${execs.results.length} of ${execs.total} executions:\n`);

    for (const exec of execs.results) {
      const fields = exec.jira || {};
      console.log(`  ${fields.key}: ${fields.summary}`);
      console.log(`    Status: ${fields.status?.name || "?"}`);
      console.log(`    Created: ${fields.created || "?"}`);
      console.log(`    Environments: ${(exec.testEnvironments || []).join(", ") || "(none)"}`);
      console.log(`    Test Runs: ${exec.testRuns?.total || 0} total`);

      if (exec.testRuns?.results?.length) {
        for (const run of exec.testRuns.results.slice(0, 3)) {
          const testFields = run.test?.jira || {};
          console.log(`      - ${testFields.key || "?"}: ${run.status?.name || "?"} (${run.startedOn || "not started"} → ${run.finishedOn || "not finished"})`);
          if (run.comment) console.log(`        Comment: ${run.comment.substring(0, 80)}...`);
        }
        if (exec.testRuns.results.length > 3) console.log(`      ... and ${exec.testRuns.total - 3} more`);
      }
      console.log();
    }
  }

  // 3. Check test run statuses available
  console.log("=== TEST RUN STATUS DISTRIBUTION (sample) ===\n");
  const statusSample = await graphql(token, `{
    getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 10) {
      results {
        issueId
        jira(fields: ["key"])
        testRuns(limit: 100) {
          total
          results {
            status { name }
          }
        }
      }
    }
  }`);

  if (statusSample.errors) {
    console.log("Status query errors:", JSON.stringify(statusSample.errors, null, 2));
  } else {
    const statusCounts = {};
    let totalRuns = 0;
    for (const exec of statusSample.data?.getTestExecutions?.results || []) {
      for (const run of exec.testRuns?.results || []) {
        const s = run.status?.name || "unknown";
        statusCounts[s] = (statusCounts[s] || 0) + 1;
        totalRuns++;
      }
    }
    console.log(`Sampled ${totalRuns} test runs across 10 executions:`);
    for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${status}: ${count}`);
    }
  }

  // 4. Raw structure of one execution
  console.log("\n=== RAW STRUCTURE (first execution, first 2 runs) ===\n");
  const rawExec = await graphql(token, `{
    getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 1) {
      results {
        issueId
        jira(fields: ["key", "summary", "status", "created", "fixVersions"])
        testEnvironments
        testPlans(limit: 5) {
          results {
            issueId
            jira(fields: ["key", "summary"])
          }
        }
        testRuns(limit: 2) {
          total
          results {
            status { name color description }
            startedOn
            finishedOn
            comment
            evidence {
              filename
              downloadLink
            }
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
          }
        }
      }
    }
  }`);

  if (rawExec.errors) {
    console.log("Raw query errors:", JSON.stringify(rawExec.errors, null, 2));
  } else {
    console.log(JSON.stringify(rawExec.data?.getTestExecutions?.results?.[0], null, 2));
  }

  // 5. Full count of all test runs across all executions
  console.log("\n=== TOTAL TEST RUNS ACROSS ALL EXECUTIONS ===\n");
  let totalTestRuns = 0;
  let execsScanned = 0;
  for (let start = 0; ; start += 100) {
    const batch = await graphql(token, `{
      getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 100, start: ${start}) {
        total
        results {
          issueId
          jira(fields: ["key"])
          testRuns(limit: 1) {
            total
          }
        }
      }
    }`);
    if (batch.errors) { console.log("Batch errors:", JSON.stringify(batch.errors)); break; }
    const execs = batch.data?.getTestExecutions?.results || [];
    if (execs.length === 0) break;
    for (const exec of execs) {
      const fields = exec.jira || {};
      const runCount = exec.testRuns?.total || 0;
      totalTestRuns += runCount;
      execsScanned++;
    }
    if (execsScanned >= (batch.data?.getTestExecutions?.total || 0)) break;
  }
  console.log(`${execsScanned} executions contain ${totalTestRuns} total test run results`);
  console.log(`Average: ${(totalTestRuns / execsScanned).toFixed(1)} test runs per execution`);
}

main().catch(console.error);
