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

  // 1. Check for issue-level attachments via jira() resolver
  console.log("=== ISSUE-LEVEL ATTACHMENTS (via jira fields) ===\n");

  const issueAttachQuery = await graphql(token, `{
    getTests(jql: "project = ${JIRA_PROJECT_KEY} AND issuetype = Test", limit: 50) {
      total
      results {
        issueId
        jira(fields: ["key", "summary", "attachment"])
      }
    }
  }`);

  if (issueAttachQuery.errors) {
    console.log("Issue attachment query errors:", JSON.stringify(issueAttachQuery.errors, null, 2));
  } else {
    const tests = issueAttachQuery.data?.getTests;
    let withAttachments = 0;
    let totalAttachments = 0;

    for (const test of tests.results) {
      const fields = test.jira || {};
      const attachments = fields.attachment || [];
      if (attachments.length > 0) {
        withAttachments++;
        totalAttachments += attachments.length;
        if (withAttachments <= 3) {
          console.log(`  ${fields.key}: ${attachments.length} attachment(s)`);
          attachments.forEach((a) => {
            console.log(`    - ${a.filename} (${a.mimeType}, ${a.size} bytes)`);
            console.log(`      URL: ${a.content}`);
          });
        }
      }
    }
    console.log(`\nFirst 50 tests: ${withAttachments} have attachments, ${totalAttachments} total files`);
  }

  // 2. Check for step-level attachments
  console.log("\n=== STEP-LEVEL ATTACHMENTS ===\n");

  const stepAttachQuery = await graphql(token, `{
    getTests(jql: "project = ${JIRA_PROJECT_KEY} AND issuetype = Test", limit: 50) {
      results {
        issueId
        jira(fields: ["key"])
        steps {
          id
          action
          attachments {
            id
            filename
          }
        }
      }
    }
  }`);

  if (stepAttachQuery.errors) {
    console.log("Step attachment query errors:", JSON.stringify(stepAttachQuery.errors, null, 2));
  } else {
    const tests = stepAttachQuery.data?.getTests;
    let stepsWithAttachments = 0;
    let totalStepAttachments = 0;

    for (const test of tests.results) {
      const fields = test.jira || {};
      for (const step of (test.steps || [])) {
        const attachments = step.attachments || [];
        if (attachments.length > 0) {
          stepsWithAttachments++;
          totalStepAttachments += attachments.length;
          if (stepsWithAttachments <= 3) {
            console.log(`  ${fields.key} step ${step.id}: ${attachments.length} attachment(s)`);
            attachments.forEach((a) => {
              console.log(`    - ${a.filename} (id: ${a.id})`);
            });
          }
        }
      }
    }
    console.log(`\nFirst 50 tests: ${stepsWithAttachments} steps have attachments, ${totalStepAttachments} total files`);
  }

  // 3. Full scan for attachment count (bigger sample)
  console.log("\n=== BROADER SCAN (200 tests) ===\n");
  let issueAttachCount = 0;
  let stepAttachCount = 0;
  let scanned = 0;

  for (let start = 0; start < 200; start += 100) {
    const batchQuery = await graphql(token, `{
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

    if (batchQuery.errors) {
      console.log("Batch errors:", JSON.stringify(batchQuery.errors, null, 2));
      break;
    }

    const tests = batchQuery.data?.getTests?.results || [];
    scanned += tests.length;

    for (const test of tests) {
      const fields = test.jira || {};
      const issueAtt = fields.attachment || [];
      if (issueAtt.length > 0) issueAttachCount += issueAtt.length;

      for (const step of (test.steps || [])) {
        const stepAtt = step.attachments || [];
        if (stepAtt.length > 0) stepAttachCount += stepAtt.length;
      }
    }
  }

  console.log(`Scanned ${scanned} tests:`);
  console.log(`  Issue-level attachments: ${issueAttachCount}`);
  console.log(`  Step-level attachments: ${stepAttachCount}`);
  console.log(`  Total: ${issueAttachCount + stepAttachCount}`);
}

main().catch(console.error);
