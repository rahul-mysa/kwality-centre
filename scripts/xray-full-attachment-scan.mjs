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
  console.log("Authenticated! Scanning all tests for attachments...\n");

  let issueAttachCount = 0;
  let stepAttachCount = 0;
  let testsWithIssueAttach = 0;
  let stepsWithAttach = 0;
  let scanned = 0;
  let total = 0;

  for (let start = 0; ; start += 100) {
    const data = await graphql(token, `{
      getTests(jql: "project = ${JIRA_PROJECT_KEY} AND issuetype = Test", limit: 100, start: ${start}) {
        total
        results {
          issueId
          jira(fields: ["key", "attachment"])
          steps {
            attachments {
              id
              filename
            }
          }
        }
      }
    }`);

    if (data.errors) {
      console.log("Errors:", JSON.stringify(data.errors));
      break;
    }

    const batch = data.data?.getTests;
    if (!total) total = batch.total;
    const tests = batch.results || [];
    if (tests.length === 0) break;
    scanned += tests.length;

    for (const test of tests) {
      const fields = test.jira || {};
      const issueAtt = fields.attachment || [];
      if (issueAtt.length > 0) {
        issueAttachCount += issueAtt.length;
        testsWithIssueAttach++;
      }
      for (const step of (test.steps || [])) {
        const stepAtt = step.attachments || [];
        if (stepAtt.length > 0) {
          stepAttachCount += stepAtt.length;
          stepsWithAttach++;
        }
      }
    }

    process.stdout.write(`  Scanned ${scanned}/${total}...\r`);
    if (scanned >= total) break;
  }

  console.log(`\n=== ATTACHMENT SUMMARY (${scanned} tests scanned) ===\n`);
  console.log(`Issue-level attachments: ${issueAttachCount} files across ${testsWithIssueAttach} test cases`);
  console.log(`Step-level attachments:  ${stepAttachCount} files across ${stepsWithAttach} steps`);
  console.log(`Total attachments:       ${issueAttachCount + stepAttachCount}`);
  console.log(`\nTest cases with attachments: ~${((testsWithIssueAttach / scanned) * 100).toFixed(1)}% of all tests`);
}

main().catch(console.error);
