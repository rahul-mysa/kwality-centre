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
  console.log("Authenticated! Scanning all 52 executions for dates...\n");

  const allExecs = [];

  for (let start = 0; ; start += 100) {
    const data = await graphql(token, `{
      getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 100, start: ${start}) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status", "created"])
          testRuns(limit: 1) {
            total
          }
        }
      }
    }`);

    if (data.errors) {
      console.log("Errors:", JSON.stringify(data.errors));
      break;
    }

    const batch = data.data?.getTestExecutions;
    const results = batch.results || [];
    if (results.length === 0) break;

    for (const exec of results) {
      const fields = exec.jira || {};
      allExecs.push({
        key: fields.key,
        summary: fields.summary,
        status: fields.status?.name,
        created: fields.created,
        runCount: exec.testRuns?.total || 0,
      });
    }

    if (allExecs.length >= batch.total) break;
  }

  allExecs.sort((a, b) => new Date(a.created) - new Date(b.created));

  console.log(`=== ALL ${allExecs.length} EXECUTIONS (sorted oldest → newest) ===\n`);
  console.log("  #  | Key        | Created          | Runs | Status          | Summary");
  console.log("-----|------------|------------------|------|-----------------|--------");

  allExecs.forEach((e, i) => {
    const date = new Date(e.created).toISOString().split("T")[0];
    console.log(
      `  ${String(i + 1).padStart(2)} | ${e.key.padEnd(10)} | ${date}         | ${String(e.runCount).padStart(4)} | ${(e.status || "?").padEnd(15)} | ${e.summary?.substring(0, 60)}`
    );
  });

  const earliest = new Date(allExecs[0].created);
  const latest = new Date(allExecs[allExecs.length - 1].created);
  const withRuns = allExecs.filter((e) => e.runCount > 0);
  const totalRuns = allExecs.reduce((sum, e) => sum + e.runCount, 0);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total executions: ${allExecs.length}`);
  console.log(`Earliest: ${earliest.toISOString().split("T")[0]} (${allExecs[0].key})`);
  console.log(`Latest:   ${latest.toISOString().split("T")[0]} (${allExecs[allExecs.length - 1].key})`);
  console.log(`With test runs: ${withRuns.length} (${allExecs.length - withRuns.length} empty)`);
  console.log(`Total test runs: ${totalRuns}`);
}

main().catch(console.error);
