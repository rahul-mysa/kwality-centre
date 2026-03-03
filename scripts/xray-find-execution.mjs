import { config } from "dotenv";
config({ path: ".env.local" });

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET } = process.env;

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

  // Try finding MYSA-7635 as a test execution
  const data = await graphql(token, `{
    getTestExecutions(jql: "key = MYSA-7635", limit: 10) {
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
    console.log("Errors:", JSON.stringify(data.errors, null, 2));
    return;
  }

  const execs = data.data?.getTestExecutions;
  console.log(`Found: ${execs?.total || 0} execution(s)`);

  if (execs?.results?.length > 0) {
    const exec = execs.results[0];
    const jira = typeof exec.jira === 'string' ? JSON.parse(exec.jira) : exec.jira;
    console.log(`\nKey: ${jira.key}`);
    console.log(`Summary: ${jira.summary}`);
    console.log(`Status: ${jira.status?.name}`);
    console.log(`Created: ${jira.created}`);
    console.log(`Environments: ${JSON.stringify(exec.testEnvironments)}`);
    console.log(`Test Runs: ${exec.testRuns?.total || 0}`);

    if (exec.testRuns?.results?.length > 0) {
      console.log(`\n--- Test Runs (${exec.testRuns.results.length} shown) ---`);
      for (const run of exec.testRuns.results) {
        const testJira = typeof run.test?.jira === 'string' ? JSON.parse(run.test.jira) : run.test?.jira;
        console.log(`  ${testJira?.key || '?'}: ${run.status?.name} | ${testJira?.summary || '?'}`);
        if (run.comment) console.log(`    Comment: ${run.comment}`);
      }
    }
  } else {
    console.log("No execution found with key MYSA-7635");

    // Try in TEST project too
    console.log("\nAlso checking TEST project...");
    const data2 = await graphql(token, `{
      getTestExecutions(jql: "project = MYSA AND issuetype = 'Test Execution'", limit: 5) {
        total
        results {
          issueId
          jira(fields: ["key", "summary"])
        }
      }
    }`);
    if (data2.errors) {
      console.log("MYSA project query errors:", JSON.stringify(data2.errors, null, 2));
    } else {
      const mysa = data2.data?.getTestExecutions;
      console.log(`MYSA project has ${mysa?.total || 0} test execution(s)`);
      if (mysa?.results?.length > 0) {
        for (const e of mysa.results) {
          const j = typeof e.jira === 'string' ? JSON.parse(e.jira) : e.jira;
          console.log(`  ${j.key}: ${j.summary}`);
        }
      }
    }
  }
}

main().catch(console.error);
