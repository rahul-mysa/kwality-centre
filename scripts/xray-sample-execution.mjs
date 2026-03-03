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

  // Find an execution that has some test runs with mixed statuses
  const data = await graphql(token, `{
    getTestExecutions(jql: "project = ${JIRA_PROJECT_KEY}", limit: 10) {
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
  }`);

  if (data.errors) {
    console.log("Errors:", JSON.stringify(data.errors, null, 2));
    return;
  }

  // Pick an execution that has test runs (skip empty ones)
  const execs = data.data?.getTestExecutions?.results || [];
  const bestExec = execs.find(e => (e.testRuns?.total || 0) > 3) || execs.find(e => (e.testRuns?.total || 0) > 0);

  if (!bestExec) {
    console.log("No executions with test runs found");
    return;
  }

  console.log(JSON.stringify(bestExec, null, 2));
}

main().catch(console.error);
